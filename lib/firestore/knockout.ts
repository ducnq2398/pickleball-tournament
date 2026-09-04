/**
 * Orchestration cho vòng knockout: tạo nhánh, tự điền đội, dọn dẹp khi sửa kết quả.
 *
 * Toàn bộ luật nằm ở lib/tournament/knockout.ts (pure). File này chỉ đọc/ghi
 * Firestore theo kết quả của engine.
 */
import { serverTimestamp, writeBatch } from "firebase/firestore";
import type {
  Court,
  Group,
  Match,
  RankingRuleId,
  Team,
  Tournament,
} from "@/types/tournament";
import { getDb } from "@/lib/firebase";
import { chunk } from "@/lib/utils";
import { calculateAllStandings, isGroupComplete } from "@/lib/tournament/standings";
import {
  collectDependentMatchIds,
  getChampionId,
  isKnockoutStage,
  planKnockout,
  resolveKnockoutSlots,
  type ResolveContext,
} from "@/lib/tournament/knockout";
import { canCreateKnockout } from "@/lib/tournament/validation";
import { matchDoc, newMatchId } from "./paths";
import { logAudit, type AuditActor } from "./auditLogs";
import { assertValid } from "./errors";
import { deleteKnockoutMatches, writeMatchDrafts } from "./matches";
import { setTournamentStatus } from "./tournaments";

/** Bối cảnh để engine biết đội nào đã xác định. */
export function buildResolveContext(
  groups: Group[],
  teams: Team[],
  matches: Match[],
  rankingRules: RankingRuleId[],
): ResolveContext {
  const standingsByGroup = calculateAllStandings(
    groups.map((g) => ({ id: g.id, teamIds: g.teamIds })),
    teams,
    matches,
    rankingRules,
  );
  const completedGroupIds = new Set(
    groups.filter((group) => isGroupComplete(group.id, matches)).map((group) => group.id),
  );
  return { standingsByGroup, completedGroupIds, matches };
}

/**
 * TẠO KNOCKOUT. Chỉ chạy được khi mọi trận vòng bảng đã xong.
 * Xoá nhánh cũ (nếu có) rồi sinh nhánh mới và điền luôn đội của vòng đầu.
 */
export async function createKnockout(
  tournament: Tournament,
  groups: Group[],
  teams: Team[],
  courts: Court[],
  matches: Match[],
  actor?: AuditActor,
): Promise<number> {
  assertValid(canCreateKnockout(tournament, groups, matches));

  const removed = await deleteKnockoutMatches(tournament.id);
  const groupMatches = matches.filter((m) => !isKnockoutStage(m.stage));
  const maxCode = Math.max(0, ...groupMatches.map((m) => m.code));
  const maxOrder = Math.max(-1, ...groupMatches.map((m) => m.order));

  const planned = planKnockout({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      order: g.order,
      qualificationSlots: g.qualificationSlots,
    })),
    targetScore: tournament.config.knockoutTargetScore,
    winByTwo: tournament.config.winByTwo,
    thirdPlaceMatch: tournament.config.thirdPlaceMatch,
    startCode: maxCode + 1,
    startOrder: maxOrder + 1,
    courtIds: [...courts].sort((a, b) => a.number - b.number).map((c) => c.id),
    idFactory: () => newMatchId(tournament.id),
  });

  // Điền sẵn đội cho vòng đầu tiên dựa trên BXH đã chốt.
  const context = buildResolveContext(groups, teams, groupMatches, tournament.config.rankingRules);
  const asMatches: Match[] = planned.map((m) => ({ ...m, createdAt: 0, updatedAt: 0 }));
  const { updates } = resolveKnockoutSlots(asMatches, {
    ...context,
    matches: [...groupMatches, ...asMatches],
  });

  const drafts = planned.map((match) => {
    const update = updates.find((u) => u.matchId === match.id);
    return update ? { ...match, ...update } : match;
  });

  await writeMatchDrafts(tournament.id, drafts);
  if (tournament.status !== "KNOCKOUT") {
    await setTournamentStatus(tournament.id, "KNOCKOUT", actor, { championTeamId: null });
  }

  await logAudit(
    tournament.id,
    {
      action: "CREATE_KNOCKOUT",
      previousData: { removed },
      newData: { created: drafts.length },
      message: `Tạo nhánh knockout: ${drafts.length} trận`,
    },
    actor,
  );

  return drafts.length;
}

export interface SyncResult {
  updated: number;
  conflicts: { matchId: string; reason: string }[];
  championTeamId?: string;
}

/**
 * Đồng bộ nhánh knockout với kết quả hiện tại.
 * Gọi sau mỗi lần kết thúc/sửa một trận. Chỉ ghi những trận thực sự đổi đội.
 */
export async function syncKnockout(
  tournament: Tournament,
  groups: Group[],
  teams: Team[],
  matches: Match[],
  actor?: AuditActor,
): Promise<SyncResult> {
  const knockoutMatches = matches.filter((m) => isKnockoutStage(m.stage));
  if (knockoutMatches.length === 0) return { updated: 0, conflicts: [] };

  const context = buildResolveContext(groups, teams, matches, tournament.config.rankingRules);
  const { updates, conflicts } = resolveKnockoutSlots(knockoutMatches, context);

  if (updates.length) {
    for (const group of chunk(updates, 400)) {
      const batch = writeBatch(getDb());
      for (const update of group) {
        batch.update(matchDoc(tournament.id, update.matchId), {
          ...(update.team1Id !== undefined ? { team1Id: update.team1Id } : {}),
          ...(update.team2Id !== undefined ? { team2Id: update.team2Id } : {}),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    await logAudit(
      tournament.id,
      {
        action: "SYNC_KNOCKOUT",
        newData: updates,
        message: `Cập nhật đội cho ${updates.length} trận knockout`,
      },
      actor,
    );
  }

  // Chung kết xong -> chốt nhà vô địch và đóng giải.
  const championTeamId = getChampionId(matches);
  if (championTeamId && tournament.championTeamId !== championTeamId) {
    await setTournamentStatus(tournament.id, "FINISHED", actor, { championTeamId });
  }

  return { updated: updates.length, conflicts, championTeamId };
}

/**
 * Khi Admin mở lại / sửa kết quả một trận knockout: đặt lại toàn bộ trận phía
 * sau về "chưa đấu" để không còn dữ liệu sai trong nhánh.
 */
export async function resetDependentMatches(
  tournament: Tournament,
  matches: Match[],
  matchId: string,
  actor?: AuditActor,
): Promise<{ count: number; matches: Match[] }> {
  const dependentIds = collectDependentMatchIds(matches, matchId);
  const affected = matches.filter(
    (m) => dependentIds.includes(m.id) && (m.status !== "SCHEDULED" || m.team1Id || m.team2Id),
  );
  if (affected.length === 0) return { count: 0, matches };

  for (const group of chunk(affected, 400)) {
    const batch = writeBatch(getDb());
    for (const match of group) {
      const isFromMatch = (type?: string) => type === "MATCH_WINNER" || type === "MATCH_LOSER";
      batch.update(matchDoc(tournament.id, match.id), {
        status: "SCHEDULED",
        score1: 0,
        score2: 0,
        winnerId: null,
        loserId: null,
        finishedAt: null,
        startedAt: null,
        ...(isFromMatch(match.team1Source?.type) ? { team1Id: null } : {}),
        ...(isFromMatch(match.team2Source?.type) ? { team2Id: null } : {}),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  if (tournament.status === "FINISHED") {
    await setTournamentStatus(tournament.id, "KNOCKOUT", actor, { championTeamId: null });
  }

  await logAudit(
    tournament.id,
    {
      action: "SYNC_KNOCKOUT",
      matchId,
      newData: { reset: affected.map((m) => m.code) },
      message: `Đặt lại ${affected.length} trận phía sau trong nhánh knockout`,
    },
    actor,
  );

  // Áp dụng luôn thay đổi vào bản sao cục bộ: listener onSnapshot có độ trễ,
  // mà bước đồng bộ ngay sau đó cần dữ liệu mới nhất mới ghép đúng đội.
  const affectedIds = new Set(affected.map((m) => m.id));
  const patched = matches.map((match) => {
    if (!affectedIds.has(match.id)) return match;
    const fromMatch = (type?: string) => type === "MATCH_WINNER" || type === "MATCH_LOSER";
    return {
      ...match,
      status: "SCHEDULED" as const,
      score1: 0,
      score2: 0,
      winnerId: undefined,
      loserId: undefined,
      startedAt: undefined,
      finishedAt: undefined,
      team1Id: fromMatch(match.team1Source?.type) ? undefined : match.team1Id,
      team2Id: fromMatch(match.team2Source?.type) ? undefined : match.team2Id,
    };
  });

  return { count: affected.length, matches: patched };
}

/**
 * Việc phải làm sau khi một trận kết thúc / bị sửa:
 * 1. Reset các trận phụ thuộc (nếu là knockout và kết quả đổi).
 * 2. Đồng bộ lại nhánh.
 */
export async function refreshBracketAfterResult(
  tournament: Tournament,
  groups: Group[],
  teams: Team[],
  matches: Match[],
  changedMatchId: string,
  options: { resetDependents?: boolean } = {},
  actor?: AuditActor,
): Promise<SyncResult> {
  let current = matches;
  if (options.resetDependents) {
    const reset = await resetDependentMatches(tournament, current, changedMatchId, actor);
    current = reset.matches;
  }
  return syncKnockout(tournament, groups, teams, current, actor);
}
