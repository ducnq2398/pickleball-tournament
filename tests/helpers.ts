import type { Group, Match, MatchStatus, Stage, Team } from "@/types/tournament";

let seq = 0;

export function makeTeam(id: string, name = id, groupId?: string): Team {
  return {
    id,
    name,
    players: [
      { id: `${id}-p1`, name: `${name} - VĐV 1` },
      { id: `${id}-p2`, name: `${name} - VĐV 2` },
    ],
    groupId,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function makeGroup(id: string, name: string, teamIds: string[], order = 0): Group {
  return {
    id,
    name,
    order,
    teamIds,
    qualificationSlots: 2,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function makeMatch(overrides: Partial<Match> = {}): Match {
  seq += 1;
  const base: Match = {
    id: `m${seq}`,
    code: seq,
    stage: "GROUP" as Stage,
    groupId: "gA",
    team1Id: "t1",
    team2Id: "t2",
    score1: 0,
    score2: 0,
    targetScore: 11,
    winByTwo: true,
    status: "SCHEDULED" as MatchStatus,
    order: seq,
    createdAt: 0,
    updatedAt: 0,
  };
  return { ...base, ...overrides };
}

/** Trận đã kết thúc với tỷ số cho trước, tự set winner/loser. */
export function finishedMatch(
  team1Id: string,
  team2Id: string,
  score1: number,
  score2: number,
  overrides: Partial<Match> = {},
): Match {
  const winnerId = score1 > score2 ? team1Id : team2Id;
  const loserId = score1 > score2 ? team2Id : team1Id;
  return makeMatch({
    team1Id,
    team2Id,
    score1,
    score2,
    status: "FINISHED",
    winnerId,
    loserId,
    finishedAt: 1,
    ...overrides,
  });
}
