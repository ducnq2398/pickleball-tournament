/**
 * SCORING ENGINE — trái tim của hệ thống.
 *
 * Toàn bộ luật tính điểm nằm ở đây, dưới dạng pure function. UI (React) và
 * repository (Firestore) chỉ được GỌI các hàm này, tuyệt đối không tự suy luận
 * thắng/thua. Nhờ vậy trọng tài, admin và security rules đều dùng chung một luật.
 *
 * Luật Pickleball áp dụng:
 * - Chạm `targetScore` (vòng bảng 11, knockout 15).
 * - `winByTwo = true`: phải hơn tối thiểu 2 điểm mới kết thúc (deuce kéo dài).
 * - `winByTwo = false`: chạm mốc là thắng ngay (11-10 hợp lệ).
 */
import type { Match, MatchOutcome, TeamSlot, ValidationResult } from "@/types/tournament";

/** Luật điểm áp dụng cho một trận cụ thể. */
export interface ScoreRules {
  targetScore: number;
  winByTwo: boolean;
}

/** Trần an toàn để chặn nhập nhầm (VD gõ 111 thay vì 11). */
export const MAX_REASONABLE_SCORE = 99;

const ok = (warnings: string[] = []): ValidationResult => ({ ok: true, errors: [], warnings });
const fail = (...errors: string[]): ValidationResult => ({ ok: false, errors, warnings: [] });

export function getScoreRules(match: Pick<Match, "targetScore" | "winByTwo">): ScoreRules {
  return { targetScore: match.targetScore, winByTwo: match.winByTwo };
}

function isValidInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Trận đã ĐỦ ĐIỀU KIỆN kết thúc theo luật hay chưa (không quan tâm status trong DB).
 */
export function isMatchFinished(score1: number, score2: number, rules: ScoreRules): boolean {
  if (!isValidInteger(score1) || !isValidInteger(score2)) return false;
  const max = Math.max(score1, score2);
  const min = Math.min(score1, score2);
  const requiredGap = rules.winByTwo ? 2 : 1;
  return max >= rules.targetScore && max - min >= requiredGap;
}

/**
 * Tỷ số này có thể TỒN TẠI trong một trận thật hay không.
 *
 * Chặn các trường hợp vô lý:
 * - Điểm âm / không nguyên / quá lớn.
 * - `11 - 11` khi không có luật hơn 2 điểm (trận phải kết thúc ở 11-10).
 * - `13 - 8` với target 11 (trận đã phải kết thúc từ 11-8).
 * - `12 - 11` là hợp lệ (deuce), `14 - 8` thì không.
 */
export function isValidScore(score1: number, score2: number, rules: ScoreRules): ValidationResult {
  if (!isValidInteger(score1) || !isValidInteger(score2)) {
    return fail("Điểm phải là số nguyên không âm.");
  }
  if (score1 > MAX_REASONABLE_SCORE || score2 > MAX_REASONABLE_SCORE) {
    return fail(`Điểm không thể vượt quá ${MAX_REASONABLE_SCORE}.`);
  }
  if (!Number.isInteger(rules.targetScore) || rules.targetScore < 1) {
    return fail("Cấu hình điểm chạm của trận không hợp lệ.");
  }

  const target = rules.targetScore;
  const max = Math.max(score1, score2);
  const min = Math.min(score1, score2);

  if (!rules.winByTwo) {
    if (max > target) {
      return fail(`Trận chạm ${target}: không đội nào có thể vượt quá ${target} điểm.`);
    }
    if (max === target && min === target) {
      return fail(`Hai đội không thể cùng đạt ${target} điểm.`);
    }
    return ok();
  }

  // winByTwo: chỉ chặn các tỷ số "đã phải kết thúc từ trước".
  if (isMatchFinished(score1, score2, rules)) {
    const validEnding = max === target || max - min === 2;
    if (!validEnding) {
      return fail(
        `Tỷ số ${score1} - ${score2} không hợp lệ: trận phải kết thúc sớm hơn ` +
          `(chạm ${target}, thắng cách biệt 2 điểm).`,
      );
    }
  }
  return ok();
}

export function calculateScoreDifference(score1: number, score2: number): number {
  return score1 - score2;
}

/** Đội thắng theo tỷ số hiện tại, undefined nếu trận chưa đủ điều kiện kết thúc. */
export function getWinner(match: Match): string | undefined {
  const rules = getScoreRules(match);
  if (!isMatchFinished(match.score1, match.score2, rules)) return undefined;
  return match.score1 > match.score2 ? match.team1Id : match.team2Id;
}

/** Đội thua theo tỷ số hiện tại, undefined nếu trận chưa đủ điều kiện kết thúc. */
export function getLoser(match: Match): string | undefined {
  const rules = getScoreRules(match);
  if (!isMatchFinished(match.score1, match.score2, rules)) return undefined;
  return match.score1 > match.score2 ? match.team2Id : match.team1Id;
}

/** Đánh giá đầy đủ một trận: kết thúc chưa, ai thắng, vì sao. */
export function evaluateMatch(match: Match): MatchOutcome {
  const rules = getScoreRules(match);
  const complete = isMatchFinished(match.score1, match.score2, rules);

  if (!complete) {
    const max = Math.max(match.score1, match.score2);
    const gap = Math.abs(match.score1 - match.score2);
    const reason =
      max >= rules.targetScore && rules.winByTwo
        ? `Deuce: cần thắng cách biệt 2 điểm (đang cách ${gap}).`
        : `Chưa đội nào chạm ${rules.targetScore}.`;
    return { isComplete: false, targetScore: rules.targetScore, reason };
  }

  return {
    isComplete: true,
    winnerId: getWinner(match),
    loserId: getLoser(match),
    targetScore: rules.targetScore,
    reason: `Kết thúc ${match.score1} - ${match.score2} (chạm ${rules.targetScore}${
      rules.winByTwo ? ", hơn 2 điểm" : ""
    }).`,
  };
}

/** Tỷ số sau khi cộng/trừ `delta` điểm cho một đội. */
export function nextScore(
  match: Pick<Match, "score1" | "score2">,
  slot: TeamSlot,
  delta: number,
): { score1: number; score2: number } {
  const score1 = slot === 1 ? match.score1 + delta : match.score1;
  const score2 = slot === 2 ? match.score2 + delta : match.score2;
  return { score1: Math.max(0, score1), score2: Math.max(0, score2) };
}

/**
 * Trọng tài có được phép cộng/trừ điểm lúc này không?
 * Đây là hàng rào chính chống "ghi điểm sau khi trận đã kết thúc".
 */
export function canAdjustScore(match: Match, slot: TeamSlot, delta: number): ValidationResult {
  if (match.status === "FINISHED") {
    return fail("Trận đã kết thúc. Cần Admin mở lại trận trước khi sửa điểm.");
  }
  if (match.status === "CANCELLED") {
    return fail("Trận đã bị huỷ.");
  }
  if (match.status !== "LIVE") {
    return fail("Trận chưa bắt đầu. Bấm BẮT ĐẦU TRẬN trước khi nhập điểm.");
  }
  if (!match.team1Id || !match.team2Id) {
    return fail("Trận chưa xác định đủ 2 đội.");
  }
  const rules = getScoreRules(match);
  if (isMatchFinished(match.score1, match.score2, rules) && delta > 0) {
    return fail("Tỷ số đã đủ điều kiện kết thúc — hãy bấm KẾT THÚC TRẬN.");
  }
  const next = nextScore(match, slot, delta);
  if (delta < 0 && next.score1 === match.score1 && next.score2 === match.score2) {
    return fail("Điểm không thể nhỏ hơn 0.");
  }
  return isValidScore(next.score1, next.score2, rules);
}

/** Kiểm tra một tỷ số nhập tay (admin sửa kết quả / nhập nhanh). */
export function canSetScore(match: Match, score1: number, score2: number): ValidationResult {
  if (match.status === "CANCELLED") return fail("Trận đã bị huỷ.");
  if (match.status === "FINISHED") {
    return fail("Trận đã kết thúc. Dùng chức năng MỞ LẠI TRẬN để sửa điểm.");
  }
  return isValidScore(score1, score2, getScoreRules(match));
}

/**
 * Kiểm tra tỷ số dùng để KẾT THÚC trận: vừa hợp lệ, vừa phải đủ điều kiện kết thúc.
 */
export function canFinishMatch(match: Match): ValidationResult {
  if (match.status === "FINISHED") return fail("Trận đã kết thúc rồi.");
  if (match.status === "CANCELLED") return fail("Trận đã bị huỷ.");
  if (!match.team1Id || !match.team2Id) return fail("Trận chưa xác định đủ 2 đội.");

  const rules = getScoreRules(match);
  const valid = isValidScore(match.score1, match.score2, rules);
  if (!valid.ok) return valid;

  if (!isMatchFinished(match.score1, match.score2, rules)) {
    return fail(evaluateMatch(match).reason);
  }
  return ok();
}

/** Mô tả ngắn trạng thái điểm để hiển thị (dưới bảng điểm trọng tài). */
export function describeScoreState(match: Match): string {
  const rules = getScoreRules(match);
  if (isMatchFinished(match.score1, match.score2, rules)) {
    return "Đủ điều kiện kết thúc — bấm KẾT THÚC TRẬN.";
  }
  const max = Math.max(match.score1, match.score2);
  if (rules.winByTwo && max >= rules.targetScore - 1) {
    return `Bóng set/deuce — chạm ${rules.targetScore}, phải hơn 2 điểm.`;
  }
  const remaining = rules.targetScore - max;
  return `Còn ${remaining} điểm nữa để chạm ${rules.targetScore}.`;
}
