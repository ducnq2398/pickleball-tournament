/**
 * KỊCH BẢN TỔNG (§43): chạy trọn vẹn một giải 9 đội / 2 bảng / 2 sân bằng
 * các pure function, đúng thứ tự như ngoài đời — từ lúc tạo đội tới lúc có
 * nhà vô địch. Đây là lưới an toàn cuối cùng cho toàn bộ business logic.
 */
import { describe, expect, it } from "vitest";
import type { Match, MatchDraft, StandingRow, Team } from "@/types/tournament";
import {
  createTournamentConfig,
  distributeTeams,
  getProgress,
  groupDisplayName,
} from "@/lib/tournament/tournament";
import { generateGroupSchedule } from "@/lib/tournament/schedule";
import { evaluateMatch, isMatchFinished, isValidScore } from "@/lib/tournament/scoring";
import { calculateAllStandings, isGroupComplete } from "@/lib/tournament/standings";
import {
  getBracketRounds,
  getChampionId,
  planKnockout,
  resolveKnockoutSlots,
} from "@/lib/tournament/knockout";
import { canCreateKnockout, canStartTournament } from "@/lib/tournament/validation";
import { makeTeam } from "./helpers";

const config = createTournamentConfig();

/** Biến draft thành Match hoàn chỉnh. */
function toMatch(draft: MatchDraft, id: string): Match {
  return { ...draft, id, createdAt: 0, updatedAt: 0 };
}

/** Đánh một trận tới khi kết thúc: đội mạnh hơn (seed nhỏ hơn) thắng. */
function playMatch(match: Match, teams: Team[], now: number): Match {
  const seed = (teamId?: string) => teams.find((t) => t.id === teamId)?.seed ?? 99;
  const team1Stronger = seed(match.team1Id) < seed(match.team2Id);

  const winnerScore = match.targetScore;
  const loserScore = Math.max(0, match.targetScore - 2 - (Math.abs(seed(match.team1Id) - seed(match.team2Id)) % 5));

  const score1 = team1Stronger ? winnerScore : loserScore;
  const score2 = team1Stronger ? loserScore : winnerScore;

  expect(isValidScore(score1, score2, match).ok).toBe(true);
  expect(isMatchFinished(score1, score2, match)).toBe(true);

  const played = { ...match, score1, score2, status: "LIVE" as const };
  const outcome = evaluateMatch(played);

  return {
    ...played,
    status: "FINISHED",
    winnerId: outcome.winnerId,
    loserId: outcome.loserId,
    finishedAt: now,
  };
}

describe("Kịch bản đầy đủ: 9 đội · 2 bảng · 2 sân", () => {
  // --- Bước 2: 9 đội ---
  const teams: Team[] = Array.from({ length: 9 }, (_, index) => ({
    ...makeTeam(`t${index + 1}`, `Đội ${index + 1}`),
    seed: index + 1,
  }));

  // --- Bước 3-5: 2 bảng, chia 5 + 4 ---
  const buckets = distributeTeams(
    teams.map((t) => t.id),
    config.numberOfGroups,
  );
  const groups = buckets.map((teamIds, index) => ({
    id: `group-${index}`,
    name: groupDisplayName(index),
    order: index,
    teamIds,
    qualificationSlots: config.qualifiersPerGroup,
    createdAt: 0,
    updatedAt: 0,
  }));

  const courtIds = ["court-1", "court-2"];

  it("bước 3-5: chia bảng 5 + 4 đội", () => {
    expect(groups).toHaveLength(2);
    expect(groups[0].teamIds).toHaveLength(5);
    expect(groups[1].teamIds).toHaveLength(4);
    expect(new Set(groups.flatMap((g) => g.teamIds)).size).toBe(9);
  });

  // --- Bước 6-7: sinh lịch, kiểm tra 16 trận ---
  const drafts = generateGroupSchedule({
    groups,
    targetScore: config.groupTargetScore,
    winByTwo: config.winByTwo,
    courtIds,
  });
  let matches: Match[] = drafts.map((draft, index) => toMatch(draft, `m${index + 1}`));

  it("bước 6-7: sinh đúng 16 trận vòng bảng, chia đều 2 sân", () => {
    expect(matches).toHaveLength(16);
    expect(matches.filter((m) => m.groupId === groups[0].id)).toHaveLength(10);
    expect(matches.filter((m) => m.groupId === groups[1].id)).toHaveLength(6);
    expect(matches.filter((m) => m.courtId === "court-1")).toHaveLength(8);
    expect(matches.filter((m) => m.courtId === "court-2")).toHaveLength(8);
    expect(matches.every((m) => m.targetScore === 11)).toBe(true);
  });

  it("bước 8: giải đủ điều kiện bắt đầu", () => {
    const tournament = {
      id: "t1",
      name: "Giải test",
      status: "DRAFT" as const,
      config,
      createdAt: 0,
      updatedAt: 0,
    };
    const courts = courtIds.map((id, index) => ({
      id,
      name: `Sân ${index + 1}`,
      number: index + 1,
      status: "AVAILABLE" as const,
      createdAt: 0,
      updatedAt: 0,
    }));
    const check = canStartTournament(tournament, teams, groups, courts, matches);
    expect(check.errors).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("bước 9-13: chưa đá xong thì chưa được tạo knockout", () => {
    const tournament = {
      id: "t1",
      name: "Giải test",
      status: "GROUP_STAGE" as const,
      config,
      createdAt: 0,
      updatedAt: 0,
    };
    // Đá 8/16 trận
    const partial = matches.map((match, index) =>
      index < 8 ? playMatch(match, teams, 1000 + index) : match,
    );
    const check = canCreateKnockout(tournament, groups, partial);
    expect(check.ok).toBe(false);
    expect(check.errors[0]).toContain("Còn 8 trận");
    expect(getProgress(partial).finished).toBe(8);
    expect(isGroupComplete(groups[0].id, partial)).toBe(false);
  });

  // --- Bước 14: đá hết 16 trận ---
  it("bước 14-15: đá hết vòng bảng, bảng xếp hạng phản ánh đúng sức mạnh", () => {
    matches = matches.map((match, index) => playMatch(match, teams, 1000 + index));

    expect(getProgress(matches)).toMatchObject({ total: 16, finished: 16, remaining: 0 });
    expect(groups.every((group) => isGroupComplete(group.id, matches))).toBe(true);

    const standings = calculateAllStandings(groups, teams, matches);
    for (const group of groups) {
      const rows = standings.get(group.id) as StandingRow[];
      // Seed nhỏ hơn = mạnh hơn nên phải đứng trên.
      const seeds = rows.map((row) => teams.find((t) => t.id === row.teamId)?.seed ?? 0);
      expect([...seeds]).toEqual([...seeds].sort((a, b) => a - b));
      // Tổng số trận của cả bảng khớp công thức vòng tròn.
      const played = rows.reduce((sum, row) => sum + row.played, 0);
      expect(played).toBe(group.teamIds.length * (group.teamIds.length - 1));
    }
  });

  // --- Bước 16-17: tạo knockout ---
  it("bước 16-17: tạo knockout đúng cặp Nhất A - Nhì B và Nhất B - Nhì A", () => {
    const tournament = {
      id: "t1",
      name: "Giải test",
      status: "GROUP_STAGE" as const,
      config,
      createdAt: 0,
      updatedAt: 0,
    };
    expect(canCreateKnockout(tournament, groups, matches).ok).toBe(true);

    let counter = 0;
    const planned = planKnockout({
      groups,
      targetScore: config.knockoutTargetScore,
      winByTwo: config.winByTwo,
      thirdPlaceMatch: false,
      startCode: 17,
      startOrder: 16,
      courtIds,
      idFactory: () => `ko${++counter}`,
    });
    expect(planned).toHaveLength(3);

    const knockoutMatches = planned.map((m) => ({ ...m, createdAt: 0, updatedAt: 0 }));
    const standings = calculateAllStandings(groups, teams, matches);
    const context = {
      standingsByGroup: standings,
      completedGroupIds: new Set(groups.map((g) => g.id)),
      matches: [...matches, ...knockoutMatches],
    };

    const { updates } = resolveKnockoutSlots(knockoutMatches, context);
    expect(updates).toHaveLength(2);

    const rankOf = (groupIndex: number, rank: number) =>
      (standings.get(groups[groupIndex].id) as StandingRow[]).find((r) => r.rank === rank)?.teamId;

    expect(updates[0]).toMatchObject({ team1Id: rankOf(0, 1), team2Id: rankOf(1, 2) });
    expect(updates[1]).toMatchObject({ team1Id: rankOf(1, 1), team2Id: rankOf(0, 2) });

    // --- Bước 18-19: đá bán kết, chung kết tự điền đội ---
    let bracket = knockoutMatches.map((match) => {
      const update = updates.find((u) => u.matchId === match.id);
      return update ? { ...match, ...update } : match;
    });

    bracket = bracket.map((match) =>
      match.stage === "SEMI_FINAL" ? playMatch(match, teams, 3000) : match,
    );

    const afterSemis = resolveKnockoutSlots(bracket, {
      ...context,
      matches: [...matches, ...bracket],
    });
    expect(afterSemis.conflicts).toHaveLength(0);
    expect(afterSemis.updates).toHaveLength(1);

    const semiWinners = bracket
      .filter((m) => m.stage === "SEMI_FINAL")
      .map((m) => m.winnerId);
    expect(afterSemis.updates[0]).toMatchObject({
      team1Id: semiWinners[0],
      team2Id: semiWinners[1],
    });

    // --- Bước 20-21: đá chung kết, xác định nhà vô địch ---
    bracket = bracket.map((match) => {
      if (match.stage !== "FINAL") return match;
      const filled = { ...match, ...afterSemis.updates[0] };
      return playMatch(filled, teams, 4000);
    });

    const champion = getChampionId(bracket);
    expect(champion).toBeDefined();
    expect(semiWinners).toContain(champion);
    // Đội mạnh nhất (seed 1) phải vô địch với kịch bản "kèo trên luôn thắng".
    expect(champion).toBe("t1");

    expect(getBracketRounds(bracket).map((r) => r.stage)).toEqual(["SEMI_FINAL", "FINAL"]);
  });
});
