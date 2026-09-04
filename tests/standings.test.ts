import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANKING_RULES,
  calculateAllStandings,
  calculateStandings,
  getQualifiedTeams,
  getTeamAtRank,
  isGroupComplete,
  sortStandings,
} from "@/lib/tournament/standings";
import { finishedMatch, makeMatch, makeTeam } from "./helpers";
import type { Team } from "@/types/tournament";

const teams: Team[] = ["A", "B", "C", "D"].map((id) => makeTeam(id, `Đội ${id}`, "gA"));

describe("calculateStandings", () => {
  it("chỉ tính các trận đã kết thúc", () => {
    const matches = [
      finishedMatch("A", "B", 11, 5),
      makeMatch({ team1Id: "C", team2Id: "D", score1: 9, score2: 3, status: "LIVE" }),
    ];
    const rows = calculateStandings("gA", teams, matches);

    expect(rows.find((r) => r.teamId === "A")?.played).toBe(1);
    expect(rows.find((r) => r.teamId === "C")?.played).toBe(0);
    expect(rows.find((r) => r.teamId === "C")?.scoreFor).toBe(0);
  });

  it("tính đúng thắng/thua/điểm/hiệu số", () => {
    const matches = [
      finishedMatch("A", "B", 11, 5),
      finishedMatch("A", "C", 11, 9),
      finishedMatch("B", "C", 8, 11),
    ];
    const rows = calculateStandings("gA", teams, matches);
    const a = rows.find((r) => r.teamId === "A");
    const b = rows.find((r) => r.teamId === "B");

    expect(a).toMatchObject({ played: 2, won: 2, lost: 0, scoreFor: 22, scoreAgainst: 14, diff: 8 });
    expect(b).toMatchObject({ played: 2, won: 0, lost: 2, scoreFor: 13, scoreAgainst: 22 });
    expect(a?.rank).toBe(1);
    expect(a?.matchPoints).toBe(2);
  });

  it("xếp hạng theo số trận thắng trước tiên", () => {
    const matches = [
      finishedMatch("A", "B", 11, 2),
      finishedMatch("C", "D", 11, 9),
      finishedMatch("A", "C", 11, 9),
      finishedMatch("B", "D", 11, 1),
    ];
    const rows = calculateStandings("gA", teams, matches);
    // A 2 thắng; B và C cùng 1 thắng, không đối đầu nhau -> tách bằng hiệu số
    // (B: +1, C: 0); D trắng tay.
    expect(rows.map((r) => r.teamId)).toEqual(["A", "B", "C", "D"]);
  });

  it("đội chưa đá trận nào vẫn có mặt trong bảng", () => {
    const rows = calculateStandings("gA", teams, []);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.played === 0)).toBe(true);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe("tie-break", () => {
  it("bằng số trận thắng thì xét đối đầu trực tiếp", () => {
    // A và B cùng 1 thắng 1 thua; B thắng A ở đối đầu.
    const matches = [
      finishedMatch("B", "A", 11, 9),
      finishedMatch("A", "C", 11, 3),
      finishedMatch("B", "C", 11, 8),
      finishedMatch("C", "D", 11, 2),
      finishedMatch("A", "D", 5, 11),
      finishedMatch("B", "D", 5, 11),
    ];
    const rows = calculateStandings("gA", teams, matches);
    const a = rows.findIndex((r) => r.teamId === "A");
    const b = rows.findIndex((r) => r.teamId === "B");
    expect(b).toBeLessThan(a);
    expect(rows[b].tiebreakReason ?? rows[a].tiebreakReason).toBe("Đối đầu trực tiếp");
  });

  it("đối đầu vòng tròn 3 đội thì xét hiệu số trong nội bộ nhóm", () => {
    // A > B, B > C, C > A: cùng 1 thắng đối đầu -> tách bằng hiệu số nội bộ
    // (B +5, A 0, C -5).
    const matches = [
      finishedMatch("A", "B", 11, 9),
      finishedMatch("B", "C", 11, 4),
      finishedMatch("C", "A", 11, 9),
      finishedMatch("A", "D", 11, 0),
      finishedMatch("B", "D", 11, 0),
      finishedMatch("C", "D", 11, 0),
    ];
    const rows = calculateStandings("gA", teams, matches);
    expect(rows[0].teamId).toBe("B"); // hiệu số tốt nhất trong nhóm 3 đội
    expect(rows[3].teamId).toBe("D");
  });

  it("đổi thứ tự luật xếp hạng thì đổi kết quả", () => {
    const matches = [
      finishedMatch("B", "A", 11, 9), // B thắng đối đầu
      finishedMatch("A", "C", 11, 0),
      finishedMatch("A", "D", 11, 0),
      finishedMatch("B", "C", 11, 9),
      finishedMatch("D", "B", 11, 9),
      finishedMatch("C", "D", 11, 0),
    ];
    const byHeadToHead = calculateStandings("gA", teams, matches, DEFAULT_RANKING_RULES);
    const byDiff = calculateStandings("gA", teams, matches, ["WINS", "SCORE_DIFF", "SCORE_FOR"]);

    // A và B cùng 2 thắng: B hơn ở đối đầu, A hơn ở hiệu số (+20 so với +2).
    expect(byHeadToHead[0].teamId).toBe("B");
    expect(byDiff[0].teamId).toBe("A");
  });

  it("sortStandings đánh số rank liên tục", () => {
    const rows = sortStandings(
      calculateStandings("gA", teams, [finishedMatch("A", "B", 11, 0)]),
      [],
    );
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe("helper", () => {
  const matches = [finishedMatch("A", "B", 11, 5), finishedMatch("C", "D", 11, 5)];

  it("lấy được đội theo thứ hạng và suất đi tiếp", () => {
    const rows = calculateStandings("gA", teams, matches);
    expect(getTeamAtRank(rows, 1)?.teamId).toBeDefined();
    expect(getQualifiedTeams(rows, 2)).toHaveLength(2);
    expect(getQualifiedTeams(rows, 0)).toHaveLength(0);
  });

  it("isGroupComplete chỉ đúng khi mọi trận đã xong", () => {
    const pending = [...matches, makeMatch({ team1Id: "A", team2Id: "C", status: "SCHEDULED" })];
    expect(isGroupComplete("gA", matches)).toBe(true);
    expect(isGroupComplete("gA", pending)).toBe(false);
    expect(isGroupComplete("gA", [])).toBe(false);
  });

  it("tính BXH nhiều bảng cùng lúc", () => {
    const allTeams = [...teams, makeTeam("E", "Đội E", "gB"), makeTeam("F", "Đội F", "gB")];
    const all = [...matches, finishedMatch("E", "F", 11, 3, { groupId: "gB" })];
    const result = calculateAllStandings(
      [
        { id: "gA", teamIds: ["A", "B", "C", "D"] },
        { id: "gB", teamIds: ["E", "F"] },
      ],
      allTeams,
      all,
    );
    expect(result.get("gA")).toHaveLength(4);
    expect(result.get("gB")?.[0].teamId).toBe("E");
  });
});
