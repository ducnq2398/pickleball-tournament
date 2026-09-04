import { describe, expect, it } from "vitest";
import {
  MAX_REASONABLE_SCORE,
  canAdjustScore,
  canFinishMatch,
  canSetScore,
  calculateScoreDifference,
  evaluateMatch,
  getLoser,
  getWinner,
  isMatchFinished,
  isValidScore,
  nextScore,
} from "@/lib/tournament/scoring";
import { makeMatch } from "./helpers";

const deuce = { targetScore: 11, winByTwo: true };
const suddenDeath = { targetScore: 11, winByTwo: false };
const knockout = { targetScore: 15, winByTwo: true };

describe("isMatchFinished", () => {
  it("kết thúc khi chạm 11 và hơn 2 điểm", () => {
    expect(isMatchFinished(11, 7, deuce)).toBe(true);
    expect(isMatchFinished(11, 9, deuce)).toBe(true);
    expect(isMatchFinished(7, 11, deuce)).toBe(true);
  });

  it("11-10 CHƯA kết thúc khi bắt buộc hơn 2 điểm", () => {
    expect(isMatchFinished(11, 10, deuce)).toBe(false);
    expect(isMatchFinished(12, 11, deuce)).toBe(false);
    expect(isMatchFinished(12, 10, deuce)).toBe(true);
  });

  it("11-10 kết thúc khi không bắt buộc hơn 2 điểm", () => {
    expect(isMatchFinished(11, 10, suddenDeath)).toBe(true);
  });

  it("chưa chạm mốc thì chưa kết thúc", () => {
    expect(isMatchFinished(10, 3, deuce)).toBe(false);
    expect(isMatchFinished(0, 0, deuce)).toBe(false);
  });

  it("knockout dùng mốc 15", () => {
    expect(isMatchFinished(11, 7, knockout)).toBe(false);
    expect(isMatchFinished(15, 12, knockout)).toBe(true);
  });
});

describe("isValidScore", () => {
  it("chặn điểm âm và điểm không nguyên", () => {
    expect(isValidScore(-1, 5, deuce).ok).toBe(false);
    expect(isValidScore(5.5, 5, deuce).ok).toBe(false);
  });

  it("chặn điểm lớn vô lý", () => {
    expect(isValidScore(MAX_REASONABLE_SCORE + 1, 0, deuce).ok).toBe(false);
  });

  it("chặn 11-11 khi không có luật hơn 2 điểm", () => {
    expect(isValidScore(11, 11, suddenDeath).ok).toBe(false);
    expect(isValidScore(12, 3, suddenDeath).ok).toBe(false);
    expect(isValidScore(11, 10, suddenDeath).ok).toBe(true);
  });

  it("cho phép deuce nhưng chặn tỷ số 'đáng lẽ đã kết thúc'", () => {
    expect(isValidScore(11, 11, deuce).ok).toBe(true);
    expect(isValidScore(15, 14, deuce).ok).toBe(true);
    expect(isValidScore(12, 10, deuce).ok).toBe(true);
    expect(isValidScore(13, 10, deuce).ok).toBe(false); // phải dừng ở 12-10
    expect(isValidScore(14, 8, deuce).ok).toBe(false); // phải dừng ở 11-8
    expect(isValidScore(11, 0, deuce).ok).toBe(true);
  });
});

describe("winner / loser / diff", () => {
  it("xác định đúng đội thắng thua", () => {
    const m = makeMatch({ team1Id: "A", team2Id: "B", score1: 11, score2: 6 });
    expect(getWinner(m)).toBe("A");
    expect(getLoser(m)).toBe("B");
    expect(calculateScoreDifference(m.score1, m.score2)).toBe(5);
  });

  it("chưa kết thúc thì chưa có đội thắng", () => {
    const m = makeMatch({ team1Id: "A", team2Id: "B", score1: 11, score2: 10 });
    expect(getWinner(m)).toBeUndefined();
    expect(getLoser(m)).toBeUndefined();
    expect(evaluateMatch(m).isComplete).toBe(false);
    expect(evaluateMatch(m).reason).toContain("Deuce");
  });
});

describe("canAdjustScore — hàng rào chống ghi sai điểm", () => {
  it("không cho nhập khi trận chưa bắt đầu", () => {
    const m = makeMatch({ status: "SCHEDULED" });
    expect(canAdjustScore(m, 1, 1).ok).toBe(false);
  });

  it("không cho nhập khi trận đã kết thúc", () => {
    const m = makeMatch({ status: "FINISHED", score1: 11, score2: 5 });
    const res = canAdjustScore(m, 1, 1);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("đã kết thúc");
  });

  it("không cho cộng thêm khi tỷ số đã đủ điều kiện kết thúc", () => {
    const m = makeMatch({ status: "LIVE", score1: 11, score2: 5 });
    expect(canAdjustScore(m, 1, 1).ok).toBe(false);
  });

  it("cho cộng bình thường khi đang LIVE", () => {
    const m = makeMatch({ status: "LIVE", score1: 8, score2: 6 });
    expect(canAdjustScore(m, 1, 1).ok).toBe(true);
    expect(nextScore(m, 1, 1)).toEqual({ score1: 9, score2: 6 });
  });

  it("không cho điểm âm", () => {
    const m = makeMatch({ status: "LIVE", score1: 0, score2: 3 });
    expect(canAdjustScore(m, 1, -1).ok).toBe(false);
    expect(nextScore(m, 1, -1)).toEqual({ score1: 0, score2: 3 });
  });

  it("cho phép trừ điểm để sửa nhầm khi đang LIVE", () => {
    const m = makeMatch({ status: "LIVE", score1: 5, score2: 3 });
    expect(canAdjustScore(m, 2, -1).ok).toBe(true);
  });
});

describe("canSetScore / canFinishMatch", () => {
  it("chặn nhập tay tỷ số vô lý", () => {
    const m = makeMatch({ status: "LIVE" });
    expect(canSetScore(m, 13, 4).ok).toBe(false);
    expect(canSetScore(m, 9, 4).ok).toBe(true);
  });

  it("không kết thúc được khi chưa đủ điều kiện", () => {
    const m = makeMatch({ status: "LIVE", score1: 11, score2: 10 });
    expect(canFinishMatch(m).ok).toBe(false);
  });

  it("kết thúc được khi đủ điều kiện", () => {
    const m = makeMatch({ status: "LIVE", score1: 12, score2: 10 });
    expect(canFinishMatch(m).ok).toBe(true);
  });

  it("không kết thúc trận thiếu đội", () => {
    const m = makeMatch({ status: "LIVE", score1: 11, score2: 3, team2Id: undefined });
    expect(canFinishMatch(m).ok).toBe(false);
  });
});
