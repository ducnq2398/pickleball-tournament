/**
 * Repository cho `tournaments` — tạo giải, đổi cấu hình, vòng đời giải.
 */
import {
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type CollectionReference,
} from "firebase/firestore";
import type {
  Court,
  Group,
  Match,
  Team,
  Tournament,
  TournamentConfig,
  TournamentStatus,
} from "@/types/tournament";
import { getDb } from "@/lib/firebase";
import { chunk } from "@/lib/utils";
import {
  courtDisplayName,
  createTournamentConfig,
  groupDisplayName,
} from "@/lib/tournament/tournament";
import { canStartTournament } from "@/lib/tournament/validation";
import {
  auditLogsCol,
  courtsCol,
  groupsCol,
  matchesCol,
  newTournamentId,
  teamsCol,
  tournamentDoc,
  tournamentsCol,
} from "./paths";
import { clean, parseTournament } from "./converters";
import { logAudit, type AuditActor } from "./auditLogs";
import { AppError, assertValid } from "./errors";

/** Realtime danh sách giải (mới cập nhật nhất lên đầu). */
export function watchTournaments(
  onData: (tournaments: Tournament[]) => void,
  onError?: (error: unknown) => void,
  max = 20,
): () => void {
  const q = query(tournamentsCol(), orderBy("updatedAt", "desc"), limit(max));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => parseTournament(d.id, d.data()))),
    (error) => onError?.(error),
  );
}

export function watchTournament(
  tournamentId: string,
  onData: (tournament: Tournament | null) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    tournamentDoc(tournamentId),
    (snapshot) => onData(snapshot.exists() ? parseTournament(snapshot.id, snapshot.data()) : null),
    (error) => onError?.(error),
  );
}

export interface CreateTournamentInput {
  name: string;
  date?: string;
  location?: string;
  config?: Partial<TournamentConfig>;
  /** Tạo sẵn bảng + sân theo cấu hình (mặc định có). */
  bootstrap?: boolean;
}

/**
 * Tạo giải mới. Mặc định tạo luôn các bảng (A, B, ...) và sân theo cấu hình
 * để wizard đi thẳng sang bước nhập đội.
 */
export async function createTournament(
  input: CreateTournamentInput,
  actor?: AuditActor,
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new AppError("Tên giải không được để trống.");

  const config = createTournamentConfig(input.config);
  const tournamentId = newTournamentId();
  const batch = writeBatch(getDb());

  batch.set(
    tournamentDoc(tournamentId),
    clean({
      name,
      date: input.date || undefined,
      location: input.location || undefined,
      status: "DRAFT" satisfies TournamentStatus,
      config,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  if (input.bootstrap !== false) {
    for (let i = 0; i < config.numberOfGroups; i++) {
      batch.set(
        doc(groupsCol(tournamentId)),
        clean({
          name: groupDisplayName(i),
          order: i,
          teamIds: [],
          qualificationSlots: config.qualifiersPerGroup,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }
    for (let i = 1; i <= config.numberOfCourts; i++) {
      batch.set(
        doc(courtsCol(tournamentId), `court-${i}`),
        clean({
          name: courtDisplayName(i),
          number: i,
          status: "AVAILABLE",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }
  }

  await batch.commit();
  await logAudit(
    tournamentId,
    { action: "CREATE_TOURNAMENT", newData: { name, config }, message: `Tạo giải "${name}"` },
    actor,
  );
  return tournamentId;
}

export async function updateTournament(
  tournamentId: string,
  patch: Partial<Pick<Tournament, "name" | "date" | "location">> & {
    config?: Partial<TournamentConfig>;
  },
  previous: Tournament,
  actor?: AuditActor,
): Promise<void> {
  const config = patch.config ? { ...previous.config, ...patch.config } : undefined;

  await updateDoc(
    tournamentDoc(tournamentId),
    clean({
      name: patch.name?.trim(),
      date: patch.date ?? undefined,
      location: patch.location ?? undefined,
      config,
      updatedAt: serverTimestamp(),
    }),
  );

  await logAudit(
    tournamentId,
    {
      action: "UPDATE_TOURNAMENT",
      previousData: { name: previous.name, config: previous.config },
      newData: { name: patch.name ?? previous.name, config: config ?? previous.config },
      message: "Cập nhật cấu hình giải",
    },
    actor,
  );
}

/** Đổi trạng thái giải (có kiểm soát, không nhảy lung tung). */
export async function setTournamentStatus(
  tournamentId: string,
  status: TournamentStatus,
  actor?: AuditActor,
  extra?: { championTeamId?: string | null },
): Promise<void> {
  await updateDoc(
    tournamentDoc(tournamentId),
    clean({
      status,
      championTeamId: extra?.championTeamId === null ? null : extra?.championTeamId,
      updatedAt: serverTimestamp(),
    }),
  );
}

/** BẮT ĐẦU GIẢI: kiểm tra đủ đội / bảng / sân / lịch rồi mới chuyển trạng thái. */
export async function startTournament(
  tournament: Tournament,
  teams: Team[],
  groups: Group[],
  courts: Court[],
  matches: Match[],
  actor?: AuditActor,
): Promise<void> {
  assertValid(canStartTournament(tournament, teams, groups, courts, matches));
  await setTournamentStatus(tournament.id, "GROUP_STAGE", actor);
  await logAudit(
    tournament.id,
    {
      action: "START_TOURNAMENT",
      newData: { teams: teams.length, groups: groups.length, matches: matches.length },
      message: `Bắt đầu giải với ${teams.length} đội / ${matches.length} trận`,
    },
    actor,
  );
}

async function deleteCollection(col: CollectionReference): Promise<void> {
  const snapshot = await getDocs(col);
  for (const group of chunk(snapshot.docs, 400)) {
    const batch = writeBatch(getDb());
    for (const document of group) batch.delete(document.ref);
    await batch.commit();
  }
}

/** Xoá giải + toàn bộ dữ liệu con. Hành động nguy hiểm, UI phải confirm. */
export async function deleteTournament(tournamentId: string): Promise<void> {
  await deleteCollection(matchesCol(tournamentId));
  await deleteCollection(teamsCol(tournamentId));
  await deleteCollection(groupsCol(tournamentId));
  await deleteCollection(courtsCol(tournamentId));
  await deleteCollection(auditLogsCol(tournamentId));
  await deleteDoc(tournamentDoc(tournamentId));
}

/** Dùng lại giải: xoá toàn bộ trận nhưng giữ đội/bảng/sân. */
export async function resetMatches(tournamentId: string, actor?: AuditActor): Promise<void> {
  await deleteCollection(matchesCol(tournamentId));
  await setDoc(
    tournamentDoc(tournamentId),
    { status: "DRAFT", championTeamId: null, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await logAudit(
    tournamentId,
    { action: "GENERATE_SCHEDULE", message: "Xoá toàn bộ trận, đưa giải về trạng thái Nháp" },
    actor,
  );
}
