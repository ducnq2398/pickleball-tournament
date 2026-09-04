/**
 * Repository cho `matches` — phần quan trọng nhất của hệ thống.
 *
 * NGUYÊN TẮC SỐNG CÒN:
 * 1. Mọi thay đổi điểm/trạng thái đều chạy trong `runTransaction`: đọc lại
 *    trận từ server, kiểm tra luật, rồi mới ghi. Hai trọng tài bấm +1 cùng lúc
 *    sẽ ra 2 điểm, không bao giờ mất điểm hay ghi đè nhau.
 * 2. Luật thắng/thua KHÔNG được viết lại ở đây — luôn gọi lib/tournament/scoring.
 * 3. `court.currentMatchId` là khoá sân: không bao giờ có 2 trận LIVE cùng sân.
 */
import { FirebaseError } from "firebase/app";
import {
  Timestamp,
  deleteField,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import type {
  Court,
  Group,
  Match,
  MatchDraft,
  Team,
  TeamSlot,
  Tournament,
} from "@/types/tournament";
import { getDb } from "@/lib/firebase";
import { chunk } from "@/lib/utils";
import { generateGroupSchedule } from "@/lib/tournament/schedule";
import {
  canAdjustScore,
  canFinishMatch,
  canSetScore,
  evaluateMatch,
  isValidScore,
  nextScore,
} from "@/lib/tournament/scoring";
import { canAssignCourt, canGenerateSchedule, canStartMatch } from "@/lib/tournament/validation";
import { isKnockoutStage } from "@/lib/tournament/knockout";
import { courtDoc, matchDoc, matchesCol } from "./paths";
import { clean, parseMatch } from "./converters";
import { logAudit, type AuditActor } from "./auditLogs";
import { AppError, assertValid } from "./errors";

/* -------------------------------------------------------------------------- */
/* Realtime                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * MỘT listener duy nhất cho toàn bộ trận của giải (tối ưu chi phí Firestore).
 * Mọi màn hình (admin, trọng tài, scoreboard) đều lọc từ danh sách này.
 */
export function watchMatches(
  tournamentId: string,
  onData: (matches: Match[], fromCache: boolean, hasPendingWrites: boolean) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(matchesCol(tournamentId), orderBy("order", "asc"));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) =>
      onData(
        snapshot.docs.map((d) => parseMatch(d.id, d.data())),
        snapshot.metadata.fromCache,
        snapshot.metadata.hasPendingWrites,
      ),
    (error) => onError?.(error),
  );
}

/* -------------------------------------------------------------------------- */
/* Transaction helper                                                         */
/* -------------------------------------------------------------------------- */

async function readMatch(transaction: Transaction, ref: DocumentReference): Promise<Match> {
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists()) throw new AppError("Trận đấu không tồn tại (có thể vừa bị xoá).");
  return parseMatch(snapshot.id, snapshot.data());
}

/** Sân có đang bị trận khác chiếm không? Đọc trong transaction nên luôn mới nhất. */
async function readCourtLock(
  transaction: Transaction,
  tournamentId: string,
  courtId: string,
): Promise<{ ref: DocumentReference; currentMatchId?: string }> {
  const ref = courtDoc(tournamentId, courtId);
  const snapshot = await transaction.get(ref);
  const currentMatchId = snapshot.exists()
    ? ((snapshot.data().currentMatchId as string | undefined) ?? undefined)
    : undefined;
  return { ref, currentMatchId };
}

/* -------------------------------------------------------------------------- */
/* Ghi điểm khi mạng chập chờn                                                */
/* -------------------------------------------------------------------------- */

/**
 * Transaction của Firestore BẮT BUỘC phải nói chuyện được với server — mất mạng
 * là fail ngay. Trọng tài ngoài sân không thể chấp nhận điều đó, nên khi offline
 * ta chuyển sang `increment()`:
 *
 * - `increment` là phép cộng nguyên tử phía server: hai thiết bị cùng +1 sẽ ra
 *   +2, không bao giờ ghi đè mất điểm.
 * - Firestore SDK xếp hàng thao tác này và tự gửi khi có mạng lại.
 * - Đổi lại, luật được kiểm tra trên bản snapshot cục bộ (đã gồm cả các thay đổi
 *   đang chờ gửi) thay vì đọc lại từ server.
 */
async function withOfflineFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) return fallback();

  try {
    return await primary();
  } catch (error) {
    const code = error instanceof FirebaseError ? error.code.replace(/^firestore\//, "") : "";
    if (code === "unavailable" || code === "deadline-exceeded") return fallback();
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Sinh lịch                                                                  */
/* -------------------------------------------------------------------------- */

async function deleteAllMatches(tournamentId: string): Promise<number> {
  const snapshot = await getDocs(matchesCol(tournamentId));
  for (const group of chunk(snapshot.docs, 400)) {
    const batch = writeBatch(getDb());
    for (const document of group) batch.delete(document.ref);
    await batch.commit();
  }
  return snapshot.size;
}

export async function writeMatchDrafts(
  tournamentId: string,
  drafts: (MatchDraft & { id?: string })[],
): Promise<void> {
  for (const group of chunk(drafts, 400)) {
    const batch = writeBatch(getDb());
    for (const draft of group) {
      const { id, ...rest } = draft;
      const ref = id ? matchDoc(tournamentId, id) : doc(matchesCol(tournamentId));
      batch.set(
        ref,
        clean({
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }
    await batch.commit();
  }
}

/**
 * Sinh (hoặc sinh lại) toàn bộ lịch vòng bảng.
 * CẢNH BÁO: xoá sạch trận cũ — UI bắt buộc phải confirm trước khi gọi.
 */
export async function generateGroupMatches(
  tournament: Tournament,
  groups: Group[],
  teams: Team[],
  courts: Court[],
  existingMatches: Match[],
  actor?: AuditActor,
): Promise<number> {
  assertValid(canGenerateSchedule(groups, teams, existingMatches));

  const drafts = generateGroupSchedule({
    groups: groups.map((g) => ({ id: g.id, name: g.name, order: g.order, teamIds: g.teamIds })),
    targetScore: tournament.config.groupTargetScore,
    winByTwo: tournament.config.winByTwo,
    courtIds: [...courts].sort((a, b) => a.number - b.number).map((c) => c.id),
  });

  const removed = await deleteAllMatches(tournament.id);
  await writeMatchDrafts(tournament.id, drafts);

  await logAudit(
    tournament.id,
    {
      action: "GENERATE_SCHEDULE",
      previousData: { removed },
      newData: { created: drafts.length },
      message: `Sinh lịch vòng bảng: ${drafts.length} trận (xoá ${removed} trận cũ)`,
    },
    actor,
  );
  return drafts.length;
}

/* -------------------------------------------------------------------------- */
/* Phân sân                                                                   */
/* -------------------------------------------------------------------------- */

export async function assignCourt(
  tournamentId: string,
  match: Match,
  courtId: string | undefined,
  allMatches: Match[],
  actor?: AuditActor,
): Promise<void> {
  assertValid(canAssignCourt(match, courtId, allMatches));

  await runTransaction(getDb(), async (transaction) => {
    const ref = matchDoc(tournamentId, match.id);
    const current = await readMatch(transaction, ref);

    if (current.status === "FINISHED") {
      throw new AppError("Trận đã kết thúc, không đổi sân được.");
    }

    // Trận đang LIVE thì phải chuyển cả khoá sân.
    if (current.status === "LIVE") {
      const target = courtId ? await readCourtLock(transaction, tournamentId, courtId) : null;
      const previous = current.courtId
        ? await readCourtLock(transaction, tournamentId, current.courtId)
        : null;

      if (target && target.currentMatchId && target.currentMatchId !== current.id) {
        throw new AppError("Sân đích đang có trận khác thi đấu.");
      }
      if (previous && previous.currentMatchId === current.id) {
        transaction.update(previous.ref, {
          currentMatchId: null,
          status: "AVAILABLE",
          updatedAt: serverTimestamp(),
        });
      }
      if (target) {
        transaction.update(target.ref, {
          currentMatchId: current.id,
          status: "IN_USE",
          updatedAt: serverTimestamp(),
        });
      }
    }

    transaction.update(ref, {
      courtId: courtId ?? deleteField(),
      updatedAt: serverTimestamp(),
    });
  });

  await logAudit(
    tournamentId,
    {
      action: "ASSIGN_COURT",
      matchId: match.id,
      previousData: { courtId: match.courtId },
      newData: { courtId },
      message: `Trận #${match.code}: đổi sân`,
    },
    actor,
  );
}

/* -------------------------------------------------------------------------- */
/* Vòng đời trận                                                              */
/* -------------------------------------------------------------------------- */

export async function startMatch(
  tournamentId: string,
  match: Match,
  allMatches: Match[],
  actor?: AuditActor,
): Promise<void> {
  assertValid(canStartMatch(match, allMatches));

  await runTransaction(getDb(), async (transaction) => {
    const ref = matchDoc(tournamentId, match.id);
    const current = await readMatch(transaction, ref);

    if (current.status === "LIVE") return; // ai đó vừa bắt đầu -> coi như xong
    if (current.status === "FINISHED") throw new AppError("Trận đã kết thúc.");
    if (current.status === "CANCELLED") throw new AppError("Trận đã bị huỷ.");
    if (!current.team1Id || !current.team2Id) throw new AppError("Trận chưa đủ 2 đội.");

    if (current.courtId) {
      const lock = await readCourtLock(transaction, tournamentId, current.courtId);
      if (lock.currentMatchId && lock.currentMatchId !== current.id) {
        const other = await transaction.get(matchDoc(tournamentId, lock.currentMatchId));
        const otherStatus = other.exists() ? other.data().status : undefined;
        if (otherStatus === "LIVE") {
          throw new AppError("Sân đang có trận khác thi đấu. Hãy kết thúc trận đó trước.");
        }
      }
      transaction.update(lock.ref, {
        currentMatchId: current.id,
        status: "IN_USE",
        updatedAt: serverTimestamp(),
      });
    }

    transaction.update(ref, {
      status: "LIVE",
      score1: 0,
      score2: 0,
      startedAt: Timestamp.now(),
      updatedAt: serverTimestamp(),
    });
  });

  await logAudit(
    tournamentId,
    { action: "START_MATCH", matchId: match.id, message: `Bắt đầu trận #${match.code}` },
    actor,
  );
}

/**
 * Cộng/trừ điểm — đường đi chính của trọng tài.
 *
 * Online: chạy trong transaction (đọc lại từ server, kiểm tra luật, rồi ghi).
 * Offline: dùng `increment()` để không mất điểm và tự đồng bộ khi có mạng.
 *
 * @param match Bản chụp mới nhất từ listener (dùng để kiểm tra luật khi offline).
 */
export async function adjustScore(
  tournamentId: string,
  match: Match,
  slot: TeamSlot,
  delta: number,
  actor?: AuditActor,
): Promise<{ score1: number; score2: number; readyToFinish: boolean; queuedOffline: boolean }> {
  const ref = matchDoc(tournamentId, match.id);

  const result = await withOfflineFallback(
    async () =>
      runTransaction(getDb(), async (transaction) => {
        const current = await readMatch(transaction, ref);
        assertValid(canAdjustScore(current, slot, delta));
        const updated = nextScore(current, slot, delta);

        transaction.update(ref, {
          score1: updated.score1,
          score2: updated.score2,
          updatedAt: serverTimestamp(),
        });

        return {
          ...updated,
          readyToFinish: evaluateMatch({ ...current, ...updated }).isComplete,
          code: current.code,
          queuedOffline: false,
        };
      }),
    async () => {
      assertValid(canAdjustScore(match, slot, delta));
      const updated = nextScore(match, slot, delta);

      // Không await: khi offline promise chỉ resolve lúc có mạng trở lại.
      void updateDoc(ref, {
        [slot === 1 ? "score1" : "score2"]: increment(delta),
        updatedAt: serverTimestamp(),
      }).catch((error) => console.warn("[score] ghi offline thất bại:", error));

      return {
        ...updated,
        readyToFinish: evaluateMatch({ ...match, ...updated }).isComplete,
        code: match.code,
        queuedOffline: true,
      };
    },
  );

  await logAudit(
    tournamentId,
    {
      action: "UPDATE_SCORE",
      matchId: match.id,
      newData: { score1: result.score1, score2: result.score2, slot, delta },
      message: `Trận #${result.code}: ${result.score1} - ${result.score2}`,
    },
    actor,
  );

  return {
    score1: result.score1,
    score2: result.score2,
    readyToFinish: result.readyToFinish,
    queuedOffline: result.queuedOffline,
  };
}

/** Nhập thẳng tỷ số (admin quick score / trọng tài sửa nhầm). */
export async function setScore(
  tournamentId: string,
  matchId: string,
  score1: number,
  score2: number,
  actor?: AuditActor,
): Promise<void> {
  const previous = await runTransaction(getDb(), async (transaction) => {
    const ref = matchDoc(tournamentId, matchId);
    const current = await readMatch(transaction, ref);
    assertValid(canSetScore(current, score1, score2));

    transaction.update(ref, { score1, score2, updatedAt: serverTimestamp() });
    return { score1: current.score1, score2: current.score2, code: current.code };
  });

  await logAudit(
    tournamentId,
    {
      action: "UPDATE_SCORE",
      matchId,
      previousData: { score1: previous.score1, score2: previous.score2 },
      newData: { score1, score2 },
      message: `Trận #${previous.code}: sửa tỷ số thành ${score1} - ${score2}`,
    },
    actor,
  );
}

/**
 * Kết thúc trận: chốt winner/loser và trả sân.
 * Cũng có đường lui offline như khi cộng điểm.
 */
export async function finishMatch(
  tournamentId: string,
  match: Match,
  actor?: AuditActor,
): Promise<Match> {
  const ref = matchDoc(tournamentId, match.id);

  const finished = await withOfflineFallback<Match>(
    async () =>
      runTransaction(getDb(), async (transaction) => {
        const current = await readMatch(transaction, ref);
        assertValid(canFinishMatch(current));

        const outcome = evaluateMatch(current);
        if (!outcome.winnerId || !outcome.loserId) {
          throw new AppError("Không xác định được đội thắng. Kiểm tra lại tỷ số.");
        }

        let courtRef: DocumentReference | null = null;
        if (current.courtId) {
          const lock = await readCourtLock(transaction, tournamentId, current.courtId);
          if (lock.currentMatchId === current.id) courtRef = lock.ref;
        }

        const finishedAt = Timestamp.now();
        transaction.update(ref, {
          status: "FINISHED",
          winnerId: outcome.winnerId,
          loserId: outcome.loserId,
          finishedAt,
          updatedAt: serverTimestamp(),
        });

        if (courtRef) {
          transaction.update(courtRef, {
            currentMatchId: null,
            status: "AVAILABLE",
            updatedAt: serverTimestamp(),
          });
        }

        return {
          ...current,
          status: "FINISHED" as const,
          winnerId: outcome.winnerId,
          loserId: outcome.loserId,
          finishedAt: finishedAt.toMillis(),
        };
      }),
    async () => {
      assertValid(canFinishMatch(match));
      const outcome = evaluateMatch(match);
      if (!outcome.winnerId || !outcome.loserId) {
        throw new AppError("Không xác định được đội thắng. Kiểm tra lại tỷ số.");
      }

      const finishedAt = Timestamp.now();
      void updateDoc(ref, {
        status: "FINISHED",
        winnerId: outcome.winnerId,
        loserId: outcome.loserId,
        finishedAt,
        updatedAt: serverTimestamp(),
      }).catch((error) => console.warn("[match] kết thúc trận offline thất bại:", error));

      if (match.courtId) {
        void updateDoc(courtDoc(tournamentId, match.courtId), {
          currentMatchId: null,
          status: "AVAILABLE",
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      }

      return {
        ...match,
        status: "FINISHED" as const,
        winnerId: outcome.winnerId,
        loserId: outcome.loserId,
        finishedAt: finishedAt.toMillis(),
      };
    },
  );

  await logAudit(
    tournamentId,
    {
      action: "FINISH_MATCH",
      matchId: match.id,
      newData: {
        score1: finished.score1,
        score2: finished.score2,
        winnerId: finished.winnerId,
      },
      message: `Kết thúc trận #${finished.code}: ${finished.score1} - ${finished.score2}`,
    },
    actor,
  );

  return finished;
}

/**
 * MỞ LẠI TRẬN (chỉ Admin). Đưa trận về LIVE để sửa điểm.
 * Việc reset các trận knockout phía sau do lib/firestore/knockout.ts lo.
 */
export async function reopenMatch(
  tournamentId: string,
  matchId: string,
  actor?: AuditActor,
): Promise<Match> {
  const reopened = await runTransaction(getDb(), async (transaction) => {
    const ref = matchDoc(tournamentId, matchId);
    const current = await readMatch(transaction, ref);

    if (current.status !== "FINISHED") {
      throw new AppError("Chỉ mở lại được trận đã kết thúc.");
    }

    if (current.courtId) {
      const lock = await readCourtLock(transaction, tournamentId, current.courtId);
      if (!lock.currentMatchId) {
        transaction.update(lock.ref, {
          currentMatchId: current.id,
          status: "IN_USE",
          updatedAt: serverTimestamp(),
        });
      }
    }

    transaction.update(ref, {
      status: "LIVE",
      winnerId: deleteField(),
      loserId: deleteField(),
      finishedAt: deleteField(),
      updatedAt: serverTimestamp(),
    });

    return current;
  });

  await logAudit(
    tournamentId,
    {
      action: "REOPEN_MATCH",
      matchId,
      previousData: {
        score1: reopened.score1,
        score2: reopened.score2,
        winnerId: reopened.winnerId,
      },
      message: `Mở lại trận #${reopened.code}`,
    },
    actor,
  );

  return reopened;
}

/**
 * Sửa tỷ số của một trận ĐÃ KẾT THÚC (Admin).
 * Tỷ số mới vẫn phải là một tỷ số kết thúc hợp lệ; winner/loser được tính lại.
 */
export async function editFinishedScore(
  tournamentId: string,
  matchId: string,
  score1: number,
  score2: number,
  actor?: AuditActor,
): Promise<Match> {
  const updated = await runTransaction(getDb(), async (transaction) => {
    const ref = matchDoc(tournamentId, matchId);
    const current = await readMatch(transaction, ref);

    if (current.status !== "FINISHED") {
      throw new AppError("Trận chưa kết thúc — dùng chức năng nhập điểm bình thường.");
    }

    const rules = { targetScore: current.targetScore, winByTwo: current.winByTwo };
    assertValid(isValidScore(score1, score2, rules));

    const candidate: Match = { ...current, score1, score2 };
    const outcome = evaluateMatch(candidate);
    if (!outcome.isComplete || !outcome.winnerId || !outcome.loserId) {
      throw new AppError(
        `Tỷ số ${score1} - ${score2} chưa đủ điều kiện kết thúc trận (chạm ${current.targetScore}).`,
      );
    }

    transaction.update(ref, {
      score1,
      score2,
      winnerId: outcome.winnerId,
      loserId: outcome.loserId,
      updatedAt: serverTimestamp(),
    });

    return {
      ...candidate,
      winnerId: outcome.winnerId,
      loserId: outcome.loserId,
      previousWinnerId: current.winnerId,
    };
  });

  await logAudit(
    tournamentId,
    {
      action: "UPDATE_SCORE",
      matchId,
      previousData: { winnerId: updated.previousWinnerId },
      newData: { score1, score2, winnerId: updated.winnerId },
      message: `Sửa kết quả trận #${updated.code} thành ${score1} - ${score2}`,
    },
    actor,
  );

  const { previousWinnerId: _ignored, ...match } = updated;
  return match;
}

export async function cancelMatch(
  tournamentId: string,
  match: Match,
  actor?: AuditActor,
): Promise<void> {
  await runTransaction(getDb(), async (transaction) => {
    const ref = matchDoc(tournamentId, match.id);
    const current = await readMatch(transaction, ref);

    if (current.courtId) {
      const lock = await readCourtLock(transaction, tournamentId, current.courtId);
      if (lock.currentMatchId === current.id) {
        transaction.update(lock.ref, {
          currentMatchId: null,
          status: "AVAILABLE",
          updatedAt: serverTimestamp(),
        });
      }
    }

    transaction.update(ref, {
      status: "CANCELLED",
      winnerId: deleteField(),
      loserId: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });

  await logAudit(
    tournamentId,
    { action: "CANCEL_MATCH", matchId: match.id, message: `Huỷ trận #${match.code}` },
    actor,
  );
}

/** Đưa một trận đã huỷ trở lại lịch. */
export async function restoreMatch(tournamentId: string, matchId: string): Promise<void> {
  await updateDoc(matchDoc(tournamentId, matchId), {
    status: "SCHEDULED",
    score1: 0,
    score2: 0,
    updatedAt: serverTimestamp(),
  });
}

/** Xoá toàn bộ trận knockout (khi tạo lại nhánh). */
export async function deleteKnockoutMatches(tournamentId: string): Promise<number> {
  const snapshot = await getDocs(
    query(matchesCol(tournamentId), where("stage", "!=", "GROUP")),
  );
  const docs = snapshot.docs.filter((d) => isKnockoutStage(parseMatch(d.id, d.data()).stage));
  for (const group of chunk(docs, 400)) {
    const batch = writeBatch(getDb());
    for (const document of group) batch.delete(document.ref);
    await batch.commit();
  }
  return docs.length;
}
