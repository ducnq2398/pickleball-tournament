import { describe, expect, it } from "vitest";
import {
  bracketSeedOrder,
  buildQualificationSlots,
  collectDependentMatchIds,
  findDirectDependents,
  getBracketRounds,
  getChampionId,
  getRunnerUpId,
  getThirdPlaceId,
  planKnockout,
  resolveKnockoutSlots,
  sourceLabel,
  stageForMatchCount,
  validateKnockoutPlan,
} from "@/lib/tournament/knockout";
import { calculateAllStandings } from "@/lib/tournament/standings";
import type { Match, StandingRow } from "@/types/tournament";
import { finishedMatch, makeTeam } from "./helpers";

const groups = [
  { id: "gA", name: "A", order: 0, qualificationSlots: 2 },
  { id: "gB", name: "B", order: 1, qualificationSlots: 2 },
];

let counter = 0;
const idFactory = () => `ko${++counter}`;
const plan = (over: Partial<Parameters<typeof planKnockout>[0]> = {}) => {
  counter = 0;
  return planKnockout({
    groups,
    targetScore: 15,
    winByTwo: true,
    thirdPlaceMatch: false,
    startCode: 17,
    startOrder: 16,
    courtIds: ["court-1", "court-2"],
    idFactory,
    ...over,
  });
};

/** Biến PlannedMatch thành Match đầy đủ để test resolve. */
const toMatch = (m: ReturnType<typeof plan>[number]): Match => ({
  ...m,
  createdAt: 0,
  updatedAt: 0,
});

describe("bracketSeedOrder", () => {
  it("4 đội: 1v4, 2v3", () => {
    expect(bracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
  });
  it("8 đội theo chuẩn: 1v8, 4v5, 2v7, 3v6", () => {
    expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
  it("số đội không phải luỹ thừa 2 thì không hợp lệ", () => {
    expect(bracketSeedOrder(6)).toEqual([]);
  });
});

describe("validateKnockoutPlan", () => {
  it("2 bảng × 2 suất = 4 đội: hợp lệ", () => {
    expect(validateKnockoutPlan(groups).ok).toBe(true);
  });
  it("2 bảng × 3 suất = 6 đội: không hợp lệ", () => {
    const res = validateKnockoutPlan(groups.map((g) => ({ ...g, qualificationSlots: 3 })));
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("6");
  });
  it("4 bảng × 2 suất = 8 đội: hợp lệ", () => {
    const four = ["A", "B", "C", "D"].map((name, i) => ({
      id: `g${name}`,
      name,
      order: i,
      qualificationSlots: 2,
    }));
    expect(validateKnockoutPlan(four).ok).toBe(true);
  });
});

describe("planKnockout — 4 đội", () => {
  const matches = plan();

  it("sinh 2 bán kết + 1 chung kết", () => {
    expect(matches).toHaveLength(3);
    expect(matches.filter((m) => m.stage === "SEMI_FINAL")).toHaveLength(2);
    expect(matches.filter((m) => m.stage === "FINAL")).toHaveLength(1);
  });

  it("cặp đấu đúng yêu cầu: Nhất A vs Nhì B, Nhất B vs Nhì A", () => {
    const [sf1, sf2] = matches.filter((m) => m.stage === "SEMI_FINAL");
    expect(sf1.team1Source).toMatchObject({ groupId: "gA", rank: 1 });
    expect(sf1.team2Source).toMatchObject({ groupId: "gB", rank: 2 });
    expect(sf2.team1Source).toMatchObject({ groupId: "gB", rank: 1 });
    expect(sf2.team2Source).toMatchObject({ groupId: "gA", rank: 2 });
    expect(sourceLabel(sf1.team1Source)).toBe("Nhất bảng A");
    expect(sourceLabel(sf1.team2Source)).toBe("Nhì bảng B");
  });

  it("chung kết lấy đội thắng 2 bán kết", () => {
    const final = matches.find((m) => m.stage === "FINAL")!;
    const semis = matches.filter((m) => m.stage === "SEMI_FINAL");
    expect(final.team1Source).toMatchObject({ type: "MATCH_WINNER", matchId: semis[0].id });
    expect(final.team2Source).toMatchObject({ type: "MATCH_WINNER", matchId: semis[1].id });
  });

  it("dùng điểm chạm knockout và nối tiếp số hiệu trận vòng bảng", () => {
    expect(matches.every((m) => m.targetScore === 15 && m.winByTwo)).toBe(true);
    expect(matches.map((m) => m.code)).toEqual([17, 18, 19]);
    expect(matches.map((m) => m.order)).toEqual([16, 17, 18]);
    expect(matches.every((m) => m.status === "SCHEDULED")).toBe(true);
    expect(matches.every((m) => !m.team1Id && !m.team2Id)).toBe(true);
  });

  it("bật tranh hạng 3 thì có thêm 1 trận lấy 2 đội thua bán kết", () => {
    const withThird = plan({ thirdPlaceMatch: true });
    const third = withThird.find((m) => m.stage === "THIRD_PLACE")!;
    const semis = withThird.filter((m) => m.stage === "SEMI_FINAL");
    expect(withThird).toHaveLength(4);
    expect(third.team1Source).toMatchObject({ type: "MATCH_LOSER", matchId: semis[0].id });
    expect(third.team2Source).toMatchObject({ type: "MATCH_LOSER", matchId: semis[1].id });
  });
});

describe("planKnockout — mở rộng 8 và 16 đội", () => {
  it("4 bảng × 2 suất → 4 tứ kết + 2 bán kết + 1 chung kết", () => {
    counter = 0;
    const four = ["A", "B", "C", "D"].map((name, i) => ({
      id: `g${name}`,
      name,
      order: i,
      qualificationSlots: 2,
    }));
    const matches = planKnockout({
      groups: four,
      targetScore: 15,
      winByTwo: true,
      thirdPlaceMatch: false,
      startCode: 1,
      startOrder: 0,
      courtIds: [],
      idFactory,
    });
    expect(matches.filter((m) => m.stage === "QUARTER_FINAL")).toHaveLength(4);
    expect(matches.filter((m) => m.stage === "SEMI_FINAL")).toHaveLength(2);
    expect(matches.filter((m) => m.stage === "FINAL")).toHaveLength(1);
    // Tứ kết luôn là hai đội khác bảng.
    for (const qf of matches.filter((m) => m.stage === "QUARTER_FINAL")) {
      expect(qf.team1Source?.groupId).not.toBe(qf.team2Source?.groupId);
    }
  });

  it("2 bảng × 8 suất = 16 đội", () => {
    counter = 0;
    const matches = planKnockout({
      groups: groups.map((g) => ({ ...g, qualificationSlots: 8 })),
      targetScore: 15,
      winByTwo: true,
      thirdPlaceMatch: false,
      startCode: 1,
      startOrder: 0,
      courtIds: [],
      idFactory,
    });
    expect(matches.filter((m) => m.stage === "ROUND_OF_16")).toHaveLength(8);
    expect(matches).toHaveLength(8 + 4 + 2 + 1);
    expect(stageForMatchCount(8)).toBe("ROUND_OF_16");
  });

  it("suất đi tiếp xếp theo hạt giống: A1, B1, A2, B2", () => {
    const slots = buildQualificationSlots(groups);
    expect(slots.map((s) => `${s.groupId}#${s.rank}`)).toEqual(["gA#1", "gB#1", "gA#2", "gB#2"]);
  });
});

describe("resolveKnockoutSlots — tự động điền đội", () => {
  const teams = ["A1", "A2", "A3", "B1", "B2", "B3"].map((id) => makeTeam(id, id));

  /** Vòng bảng: A1 > A2 > A3 và B1 > B2 > B3. */
  const groupMatches: Match[] = [
    finishedMatch("A1", "A2", 11, 5, { groupId: "gA" }),
    finishedMatch("A1", "A3", 11, 5, { groupId: "gA" }),
    finishedMatch("A2", "A3", 11, 5, { groupId: "gA" }),
    finishedMatch("B1", "B2", 11, 5, { groupId: "gB" }),
    finishedMatch("B1", "B3", 11, 5, { groupId: "gB" }),
    finishedMatch("B2", "B3", 11, 5, { groupId: "gB" }),
  ];

  const standings = calculateAllStandings(
    [
      { id: "gA", teamIds: ["A1", "A2", "A3"] },
      { id: "gB", teamIds: ["B1", "B2", "B3"] },
    ],
    teams,
    groupMatches,
  );

  const context = (matches: Match[], completed = ["gA", "gB"]) => ({
    standingsByGroup: standings as Map<string, StandingRow[]>,
    completedGroupIds: new Set(completed),
    matches,
  });

  it("chưa đá xong vòng bảng thì không điền đội", () => {
    const ko = plan().map(toMatch);
    const res = resolveKnockoutSlots(ko, context(ko, []));
    expect(res.updates).toHaveLength(0);
  });

  it("điền đúng Nhất A vs Nhì B và Nhất B vs Nhì A", () => {
    const ko = plan().map(toMatch);
    const res = resolveKnockoutSlots(ko, context([...groupMatches, ...ko]));
    const [sf1, sf2] = res.updates;

    expect(sf1).toMatchObject({ team1Id: "A1", team2Id: "B2" });
    expect(sf2).toMatchObject({ team1Id: "B1", team2Id: "A2" });
    expect(res.updates).toHaveLength(2); // chung kết vẫn chờ
    expect(res.conflicts).toHaveLength(0);
  });

  it("thắng bán kết tự động vào chung kết", () => {
    const ko = plan().map(toMatch);
    const semis = ko.filter((m) => m.stage === "SEMI_FINAL");
    const played: Match[] = [
      { ...semis[0], team1Id: "A1", team2Id: "B2", score1: 15, score2: 9, status: "FINISHED", winnerId: "A1", loserId: "B2" },
      { ...semis[1], team1Id: "B1", team2Id: "A2", score1: 12, score2: 15, status: "FINISHED", winnerId: "A2", loserId: "B1" },
      ko.find((m) => m.stage === "FINAL")!,
    ];
    const res = resolveKnockoutSlots(played, context([...groupMatches, ...played]));

    expect(res.updates).toHaveLength(1);
    expect(res.updates[0]).toMatchObject({ team1Id: "A1", team2Id: "A2" });
  });

  it("sửa kết quả vòng trước khi vòng sau đã đấu thì báo xung đột", () => {
    const ko = plan().map(toMatch);
    const semis = ko.filter((m) => m.stage === "SEMI_FINAL");
    const final = ko.find((m) => m.stage === "FINAL")!;
    const played: Match[] = [
      { ...semis[0], team1Id: "A1", team2Id: "B2", score1: 9, score2: 15, status: "FINISHED", winnerId: "B2", loserId: "A1" },
      { ...semis[1], team1Id: "B1", team2Id: "A2", score1: 15, score2: 9, status: "FINISHED", winnerId: "B1", loserId: "A2" },
      { ...final, team1Id: "A1", team2Id: "B1", status: "LIVE", score1: 4, score2: 2 },
    ];
    const res = resolveKnockoutSlots(played, context([...groupMatches, ...played]));

    expect(res.updates).toHaveLength(0);
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].matchId).toBe(final.id);
  });
});

describe("phụ thuộc giữa các trận", () => {
  const ko = plan({ thirdPlaceMatch: true }).map(toMatch);
  const semis = ko.filter((m) => m.stage === "SEMI_FINAL");
  const final = ko.find((m) => m.stage === "FINAL")!;
  const third = ko.find((m) => m.stage === "THIRD_PLACE")!;

  it("tìm được trận phụ thuộc trực tiếp", () => {
    const dependents = findDirectDependents(ko, semis[0].id).map((m) => m.id);
    expect(dependents).toContain(final.id);
    expect(dependents).toContain(third.id);
  });

  it("gom được toàn bộ trận bị ảnh hưởng (đệ quy)", () => {
    const affected = collectDependentMatchIds(ko, semis[1].id);
    expect(affected).toEqual(expect.arrayContaining([final.id, third.id]));
    expect(collectDependentMatchIds(ko, final.id)).toHaveLength(0);
  });
});

describe("nhà vô địch", () => {
  const ko = plan({ thirdPlaceMatch: true }).map(toMatch);

  it("chưa đá chung kết thì chưa có nhà vô địch", () => {
    expect(getChampionId(ko)).toBeUndefined();
  });

  it("thắng chung kết là nhà vô địch", () => {
    const played = ko.map((m) =>
      m.stage === "FINAL"
        ? { ...m, team1Id: "A1", team2Id: "A2", score1: 15, score2: 11, status: "FINISHED" as const, winnerId: "A1", loserId: "A2" }
        : m.stage === "THIRD_PLACE"
          ? { ...m, team1Id: "B1", team2Id: "B2", score1: 15, score2: 3, status: "FINISHED" as const, winnerId: "B1", loserId: "B2" }
          : m,
    );
    expect(getChampionId(played)).toBe("A1");
    expect(getRunnerUpId(played)).toBe("A2");
    expect(getThirdPlaceId(played)).toBe("B1");
  });

  it("bracket được gom theo vòng, đúng thứ tự hiển thị", () => {
    const rounds = getBracketRounds(ko);
    expect(rounds.map((r) => r.stage)).toEqual(["SEMI_FINAL", "THIRD_PLACE", "FINAL"]);
  });
});
