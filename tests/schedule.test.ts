import { describe, expect, it } from "vitest";
import {
  buildWaves,
  countRoundRobinMatches,
  countRoundRobinRounds,
  expectedGroupMatchCount,
  generateGroupSchedule,
  generateRoundRobinSchedule,
  validateRoundRobin,
} from "@/lib/tournament/schedule";
import { pairKey } from "@/lib/utils";

const teamIds = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

describe("generateRoundRobinSchedule", () => {
  it("bảng 5 đội sinh đúng 10 trận", () => {
    const pairings = generateRoundRobinSchedule(teamIds(5));
    expect(pairings).toHaveLength(10);
    expect(validateRoundRobin(teamIds(5), pairings).ok).toBe(true);
  });

  it("bảng 4 đội sinh đúng 6 trận", () => {
    const pairings = generateRoundRobinSchedule(teamIds(4));
    expect(pairings).toHaveLength(6);
    expect(validateRoundRobin(teamIds(4), pairings).ok).toBe(true);
  });

  it("mỗi cặp gặp nhau đúng 1 lần, không tự đấu với chính mình", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16]) {
      const ids = teamIds(n);
      const pairings = generateRoundRobinSchedule(ids);
      const keys = pairings.map((p) => pairKey(p.team1Id, p.team2Id));

      expect(pairings).toHaveLength(countRoundRobinMatches(n));
      expect(new Set(keys).size).toBe(keys.length);
      expect(pairings.every((p) => p.team1Id !== p.team2Id)).toBe(true);
      expect(validateRoundRobin(ids, pairings).ok).toBe(true);
    }
  });

  it("mỗi đội đá đúng n-1 trận", () => {
    const ids = teamIds(5);
    const pairings = generateRoundRobinSchedule(ids);
    for (const id of ids) {
      const played = pairings.filter((p) => p.team1Id === id || p.team2Id === id);
      expect(played).toHaveLength(4);
    }
  });

  it("trong cùng một lượt, một đội chỉ xuất hiện tối đa 1 lần", () => {
    const ids = teamIds(8);
    const pairings = generateRoundRobinSchedule(ids);
    const rounds = new Set(pairings.map((p) => p.round));
    for (const round of rounds) {
      const inRound = pairings.filter((p) => p.round === round);
      const seen = inRound.flatMap((p) => [p.team1Id, p.team2Id]);
      expect(new Set(seen).size).toBe(seen.length);
    }
  });

  it("số lượt đúng công thức", () => {
    expect(countRoundRobinRounds(4)).toBe(3);
    expect(countRoundRobinRounds(5)).toBe(5);
    const pairings = generateRoundRobinSchedule(teamIds(5));
    expect(Math.max(...pairings.map((p) => p.round))).toBeLessThanOrEqual(5);
  });

  it("xử lý trường hợp biên", () => {
    expect(generateRoundRobinSchedule([])).toHaveLength(0);
    expect(generateRoundRobinSchedule(["a"])).toHaveLength(0);
    expect(generateRoundRobinSchedule(["a", "a", "b"])).toHaveLength(1); // bỏ trùng
  });
});

describe("generateGroupSchedule — giải 9 đội / 2 bảng / 2 sân", () => {
  const groups = [
    { id: "gA", name: "Bảng A", order: 0, teamIds: teamIds(5) },
    { id: "gB", name: "Bảng B", order: 1, teamIds: ["u1", "u2", "u3", "u4"] },
  ];

  const drafts = generateGroupSchedule({
    groups,
    targetScore: 11,
    winByTwo: true,
    courtIds: ["court-1", "court-2"],
  });

  it("tổng 16 trận vòng bảng (10 + 6)", () => {
    expect(drafts).toHaveLength(16);
    expect(expectedGroupMatchCount(groups)).toBe(16);
    expect(drafts.filter((m) => m.groupId === "gA")).toHaveLength(10);
    expect(drafts.filter((m) => m.groupId === "gB")).toHaveLength(6);
  });

  it("mọi trận đều là vòng bảng, chưa đấu, target 11", () => {
    expect(drafts.every((m) => m.stage === "GROUP")).toBe(true);
    expect(drafts.every((m) => m.status === "SCHEDULED")).toBe(true);
    expect(drafts.every((m) => m.targetScore === 11 && m.winByTwo)).toBe(true);
    expect(drafts.every((m) => m.score1 === 0 && m.score2 === 0)).toBe(true);
  });

  it("code và order liên tục, không trùng", () => {
    const codes = drafts.map((m) => m.code).sort((a, b) => a - b);
    expect(codes).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    const orders = drafts.map((m) => m.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it("không có cặp trùng trong cùng bảng", () => {
    for (const groupId of ["gA", "gB"]) {
      const keys = drafts
        .filter((m) => m.groupId === groupId)
        .map((m) => pairKey(m.team1Id as string, m.team2Id as string));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("phân sân luân phiên giữa 2 sân", () => {
    expect(drafts.filter((m) => m.courtId === "court-1")).toHaveLength(8);
    expect(drafts.filter((m) => m.courtId === "court-2")).toHaveLength(8);
  });

  /** Một "đợt" bắt đầu mỗi khi lịch quay lại sân đầu tiên. */
  function wavesOf(list: { courtId?: string; team1Id?: string; team2Id?: string }[], firstCourt: string) {
    const waves: (typeof list)[] = [];
    for (const match of list) {
      if (match.courtId === firstCourt || waves.length === 0) waves.push([]);
      waves[waves.length - 1].push(match);
    }
    return waves;
  }

  it("các trận chạy song song trên 2 sân không dùng chung đội", () => {
    for (const wave of wavesOf(drafts, "court-1")) {
      const teams = wave.flatMap((m) => [m.team1Id, m.team2Id]);
      expect(new Set(teams).size).toBe(teams.length);
    }
  });

  it("với 3 sân cũng không có đội nào đá 2 trận cùng lúc", () => {
    const threeCourts = generateGroupSchedule({
      groups,
      targetScore: 11,
      winByTwo: true,
      courtIds: ["c1", "c2", "c3"],
    });
    expect(threeCourts).toHaveLength(16);
    for (const wave of wavesOf(threeCourts, "c1")) {
      const teams = wave.flatMap((m) => [m.team1Id, m.team2Id]);
      expect(new Set(teams).size).toBe(teams.length);
    }
  });

  it("buildWaves không làm mất hay nhân bản trận", () => {
    const items = drafts.map((m) => ({ team1Id: m.team1Id as string, team2Id: m.team2Id as string }));
    const waves = buildWaves(items, 2);
    expect(waves.flat()).toHaveLength(items.length);
    expect(waves.every((w) => w.length > 0 && w.length <= 2)).toBe(true);
  });

  it("không gán sân khi giải chưa có sân nào", () => {
    const noCourt = generateGroupSchedule({ groups, targetScore: 11, winByTwo: true, courtIds: [] });
    expect(noCourt.every((m) => m.courtId === undefined)).toBe(true);
  });
});
