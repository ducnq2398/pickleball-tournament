/**
 * KNOCKOUT ENGINE — sinh nhánh loại trực tiếp và tự động điền đội.
 *
 * Thiết kế theo "slot source": mỗi suất trong trận biết mình đến từ đâu
 * ("Nhất bảng A", "Thắng bán kết 1"). Khi vòng bảng chốt xong hoặc một trận
 * knockout kết thúc, `resolveKnockoutSlots` sẽ điền đội thật vào vòng sau.
 *
 * Hỗ trợ 4 / 8 / 16 đội (số suất phải là luỹ thừa của 2). Với giải hiện tại
 * (2 bảng × 2 suất = 4 đội) bracket sinh ra đúng như yêu cầu:
 *   SF1 = Nhất A vs Nhì B   |   SF2 = Nhất B vs Nhì A
 */
import type {
  Match,
  MatchDraft,
  MatchSource,
  Stage,
  StandingRow,
  ValidationResult,
} from "@/types/tournament";
import { createId } from "@/lib/utils";

/** Trận knockout do engine sinh ra — có sẵn id để trận sau tham chiếu tới. */
export type PlannedMatch = MatchDraft & { id: string };

export const KNOCKOUT_STAGES: Stage[] = [
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMI_FINAL",
  "FINAL",
  "THIRD_PLACE",
];

export function isKnockoutStage(stage: Stage): boolean {
  return stage !== "GROUP";
}

export const STAGE_LABELS: Record<Stage, string> = {
  GROUP: "Vòng bảng",
  ROUND_OF_16: "Vòng 1/8",
  QUARTER_FINAL: "Tứ kết",
  SEMI_FINAL: "Bán kết",
  FINAL: "Chung kết",
  THIRD_PLACE: "Tranh hạng 3",
};

/** Thứ tự hiển thị của các vòng trong bracket. */
export const STAGE_ORDER: Record<Stage, number> = {
  GROUP: 0,
  ROUND_OF_16: 1,
  QUARTER_FINAL: 2,
  SEMI_FINAL: 3,
  THIRD_PLACE: 4,
  FINAL: 5,
};

export function rankLabel(rank: number): string {
  switch (rank) {
    case 1:
      return "Nhất";
    case 2:
      return "Nhì";
    case 3:
      return "Ba";
    case 4:
      return "Tư";
    default:
      return `Hạng ${rank}`;
  }
}

/** Vòng đấu tương ứng với số trận của vòng đó. */
export function stageForMatchCount(matchCount: number): Stage {
  if (matchCount >= 8) return "ROUND_OF_16";
  if (matchCount === 4) return "QUARTER_FINAL";
  if (matchCount === 2) return "SEMI_FINAL";
  return "FINAL";
}

function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

/**
 * Thứ tự hạt giống chuẩn của một nhánh n đội.
 * n = 4 → [1, 4, 2, 3] (tức 1v4, 2v3); n = 8 → [1, 8, 4, 5, 2, 7, 3, 6].
 */
export function bracketSeedOrder(n: number): number[] {
  if (!isPowerOfTwo(n)) return [];
  let seeds = [1, 2];
  while (seeds.length < n) {
    const total = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const seed of seeds) {
      next.push(seed, total - seed);
    }
    seeds = next;
  }
  return seeds;
}

export interface KnockoutGroupInput {
  id: string;
  name: string;
  order: number;
  qualificationSlots: number;
}

export interface KnockoutPlanOptions {
  groups: KnockoutGroupInput[];
  targetScore: number;
  winByTwo: boolean;
  thirdPlaceMatch: boolean;
  /** Số hiệu trận bắt đầu (tiếp nối vòng bảng). */
  startCode: number;
  /** Thứ tự thi đấu bắt đầu. */
  startOrder: number;
  /** Sân gợi ý ban đầu. */
  courtIds: string[];
  /** Cho phép inject id (test cần id ổn định). */
  idFactory?: () => string;
}

/** Danh sách suất đi tiếp, xếp theo hạt giống: A1, B1, ..., A2, B2, ... */
export function buildQualificationSlots(groups: KnockoutGroupInput[]): MatchSource[] {
  const sorted = [...groups].sort((a, b) => a.order - b.order);
  const maxSlots = Math.max(0, ...sorted.map((g) => g.qualificationSlots));
  const slots: MatchSource[] = [];

  for (let rank = 1; rank <= maxSlots; rank++) {
    for (const group of sorted) {
      if (group.qualificationSlots < rank) continue;
      slots.push({
        type: "GROUP_RANK",
        groupId: group.id,
        rank,
        label: `${rankLabel(rank)} bảng ${group.name}`,
      });
    }
  }
  return slots;
}

export function validateKnockoutPlan(groups: KnockoutGroupInput[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slots = buildQualificationSlots(groups);

  if (slots.length < 2) errors.push("Cần ít nhất 2 suất đi tiếp để tạo knockout.");
  else if (!isPowerOfTwo(slots.length)) {
    errors.push(
      `Tổng số suất đi tiếp đang là ${slots.length}. Nhánh knockout cần 2, 4, 8 hoặc 16 đội — ` +
        `hãy chỉnh số suất mỗi bảng.`,
    );
  }
  if (slots.length > 16) errors.push("Hiện chỉ hỗ trợ tối đa 16 đội ở vòng knockout.");

  const uneven = new Set(groups.map((g) => g.qualificationSlots));
  if (uneven.size > 1) {
    warnings.push("Các bảng có số suất đi tiếp khác nhau — hãy kiểm tra lại cặp đấu.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Sinh toàn bộ trận của nhánh knockout (chưa có đội, chỉ có nguồn suất).
 * Trả về mảng theo thứ tự thi đấu: vòng đầu → ... → chung kết (+ tranh hạng 3).
 */
export function planKnockout(options: KnockoutPlanOptions): PlannedMatch[] {
  const {
    groups,
    targetScore,
    winByTwo,
    thirdPlaceMatch,
    startCode,
    startOrder,
    courtIds,
    idFactory = () => createId("ko"),
  } = options;

  const slots = buildQualificationSlots(groups);
  if (!isPowerOfTwo(slots.length)) return [];

  const seedOrder = bracketSeedOrder(slots.length);
  const matches: PlannedMatch[] = [];
  let index = 0;

  const nextCode = () => startCode + index;
  const nextOrder = () => startOrder + index;
  const nextCourt = () => (courtIds.length ? courtIds[index % courtIds.length] : undefined);

  // --- Vòng đầu tiên: ghép theo hạt giống (1 vs n, 2 vs n-1, ...) ---
  let currentRound: PlannedMatch[] = [];
  const firstRoundCount = slots.length / 2;
  const firstStage = stageForMatchCount(firstRoundCount);

  for (let i = 0; i < firstRoundCount; i++) {
    const seedA = seedOrder[i * 2];
    const seedB = seedOrder[i * 2 + 1];
    const match: PlannedMatch = {
      id: idFactory(),
      code: nextCode(),
      stage: firstStage,
      round: 1,
      team1Source: slots[seedA - 1],
      team2Source: slots[seedB - 1],
      score1: 0,
      score2: 0,
      targetScore,
      winByTwo,
      status: "SCHEDULED",
      order: nextOrder(),
      courtId: nextCourt(),
    };
    currentRound.push(match);
    matches.push(match);
    index += 1;
  }

  // --- Các vòng sau: thắng của 2 trận liền kề gặp nhau ---
  let roundNumber = 2;
  while (currentRound.length > 1) {
    const nextRound: PlannedMatch[] = [];
    const stage = stageForMatchCount(currentRound.length / 2);
    const previousStage = currentRound[0].stage;

    for (let i = 0; i < currentRound.length; i += 2) {
      const a = currentRound[i];
      const b = currentRound[i + 1];
      const match: PlannedMatch = {
        id: idFactory(),
        code: nextCode(),
        stage,
        round: roundNumber,
        team1Source: {
          type: "MATCH_WINNER",
          matchId: a.id,
          label: `Thắng ${STAGE_LABELS[previousStage]} ${i + 1}`,
        },
        team2Source: {
          type: "MATCH_WINNER",
          matchId: b.id,
          label: `Thắng ${STAGE_LABELS[previousStage]} ${i + 2}`,
        },
        score1: 0,
        score2: 0,
        targetScore,
        winByTwo,
        status: "SCHEDULED",
        order: nextOrder(),
        courtId: nextCourt(),
      };
      nextRound.push(match);
      matches.push(match);
      index += 1;
    }

    // Tranh hạng 3 lấy 2 đội thua bán kết.
    if (thirdPlaceMatch && stage === "FINAL" && currentRound.length === 2) {
      const [sf1, sf2] = currentRound;
      matches.push({
        id: idFactory(),
        code: nextCode(),
        stage: "THIRD_PLACE",
        round: roundNumber,
        team1Source: {
          type: "MATCH_LOSER",
          matchId: sf1.id,
          label: `Thua ${STAGE_LABELS[previousStage]} 1`,
        },
        team2Source: {
          type: "MATCH_LOSER",
          matchId: sf2.id,
          label: `Thua ${STAGE_LABELS[previousStage]} 2`,
        },
        score1: 0,
        score2: 0,
        targetScore,
        winByTwo,
        status: "SCHEDULED",
        order: nextOrder(),
        courtId: nextCourt(),
      });
      index += 1;
    }

    currentRound = nextRound;
    roundNumber += 1;
  }

  return matches;
}

/* -------------------------------------------------------------------------- */
/* Điền đội vào các suất                                                       */
/* -------------------------------------------------------------------------- */

export interface ResolveContext {
  /** BXH đã sắp xếp của từng bảng. */
  standingsByGroup: Map<string, StandingRow[]>;
  /** Bảng nào đã đá xong toàn bộ (chỉ khi xong mới được lấy thứ hạng). */
  completedGroupIds: Set<string>;
  /** Toàn bộ trận (để tra winner/loser của trận trước). */
  matches: Match[];
}

/** Đội thật tương ứng với một nguồn suất; undefined nếu chưa xác định. */
export function resolveSource(
  source: MatchSource | undefined,
  context: ResolveContext,
): string | undefined {
  if (!source) return undefined;

  switch (source.type) {
    case "TEAM":
      return source.teamId;

    case "GROUP_RANK": {
      if (!source.groupId || !source.rank) return undefined;
      if (!context.completedGroupIds.has(source.groupId)) return undefined;
      const rows = context.standingsByGroup.get(source.groupId) ?? [];
      return rows.find((row) => row.rank === source.rank)?.teamId;
    }

    case "MATCH_WINNER": {
      const match = context.matches.find((m) => m.id === source.matchId);
      if (!match || match.status !== "FINISHED") return undefined;
      return match.winnerId;
    }

    case "MATCH_LOSER": {
      const match = context.matches.find((m) => m.id === source.matchId);
      if (!match || match.status !== "FINISHED") return undefined;
      return match.loserId;
    }

    default:
      return undefined;
  }
}

export interface SlotResolution {
  matchId: string;
  team1Id?: string;
  team2Id?: string;
}

export interface ResolveResult {
  /** Các trận cần ghi lại đội (chỉ những trận thực sự thay đổi). */
  updates: SlotResolution[];
  /** Trận đang LIVE/FINISHED nhưng đội nguồn đã đổi — cần admin xử lý. */
  conflicts: { matchId: string; reason: string }[];
}

/**
 * Tính các cập nhật cần ghi để nhánh knockout khớp với kết quả hiện tại.
 * Chỉ trả về phần THAY ĐỔI nên gọi lại nhiều lần không tốn write.
 */
export function resolveKnockoutSlots(matches: Match[], context: ResolveContext): ResolveResult {
  const updates: SlotResolution[] = [];
  const conflicts: { matchId: string; reason: string }[] = [];

  for (const match of matches) {
    if (!isKnockoutStage(match.stage)) continue;
    if (match.status === "CANCELLED") continue;

    const team1Id = resolveSource(match.team1Source, context) ?? match.team1Id;
    const team2Id = resolveSource(match.team2Source, context) ?? match.team2Id;

    const changed1 = team1Id !== match.team1Id;
    const changed2 = team2Id !== match.team2Id;
    if (!changed1 && !changed2) continue;

    if (match.status === "LIVE" || match.status === "FINISHED") {
      conflicts.push({
        matchId: match.id,
        reason:
          "Đội của trận này đã thay đổi do kết quả vòng trước bị sửa. " +
          "Hãy mở lại trận để cập nhật.",
      });
      continue;
    }

    updates.push({
      matchId: match.id,
      ...(changed1 ? { team1Id } : {}),
      ...(changed2 ? { team2Id } : {}),
    });
  }

  return { updates, conflicts };
}

/** Các trận phụ thuộc trực tiếp vào kết quả của `matchId`. */
export function findDirectDependents(matches: Match[], matchId: string): Match[] {
  const dependsOnMatch = (source?: MatchSource): boolean =>
    !!source &&
    (source.type === "MATCH_WINNER" || source.type === "MATCH_LOSER") &&
    source.matchId === matchId;

  return matches.filter(
    (m) => dependsOnMatch(m.team1Source) || dependsOnMatch(m.team2Source),
  );
}

/**
 * Toàn bộ trận bị ảnh hưởng nếu kết quả của `matchId` thay đổi (đệ quy).
 * Dùng khi Admin sửa điểm/mở lại một trận knockout: các trận sau phải reset.
 */
export function collectDependentMatchIds(matches: Match[], matchId: string): string[] {
  const result: string[] = [];
  const queue = [matchId];
  const seen = new Set<string>([matchId]);

  while (queue.length) {
    const current = queue.shift() as string;
    for (const dependent of findDirectDependents(matches, current)) {
      if (seen.has(dependent.id)) continue;
      seen.add(dependent.id);
      result.push(dependent.id);
      queue.push(dependent.id);
    }
  }
  return result;
}

/** Nhà vô địch: đội thắng trận chung kết đã kết thúc. */
export function getChampionId(matches: Match[]): string | undefined {
  const final = matches.find((m) => m.stage === "FINAL");
  if (!final || final.status !== "FINISHED") return undefined;
  return final.winnerId;
}

export function getRunnerUpId(matches: Match[]): string | undefined {
  const final = matches.find((m) => m.stage === "FINAL");
  if (!final || final.status !== "FINISHED") return undefined;
  return final.loserId;
}

export function getThirdPlaceId(matches: Match[]): string | undefined {
  const third = matches.find((m) => m.stage === "THIRD_PLACE");
  if (!third || third.status !== "FINISHED") return undefined;
  return third.winnerId;
}

/** Gom trận knockout theo vòng để vẽ bracket. */
export function getBracketRounds(matches: Match[]): { stage: Stage; matches: Match[] }[] {
  const knockout = matches.filter((m) => isKnockoutStage(m.stage));
  const byStage = new Map<Stage, Match[]>();

  for (const match of knockout) {
    const list = byStage.get(match.stage) ?? [];
    list.push(match);
    byStage.set(match.stage, list);
  }

  return [...byStage.entries()]
    .sort((a, b) => STAGE_ORDER[a[0]] - STAGE_ORDER[b[0]])
    .map(([stage, list]) => ({
      stage,
      matches: [...list].sort((a, b) => a.order - b.order),
    }));
}

/** Nhãn hiển thị cho một suất chưa xác định đội. */
export function sourceLabel(source?: MatchSource): string {
  if (!source) return "Chưa xác định";
  if (source.label) return source.label;
  switch (source.type) {
    case "GROUP_RANK":
      return `${rankLabel(source.rank ?? 0)} bảng`;
    case "MATCH_WINNER":
      return "Đội thắng vòng trước";
    case "MATCH_LOSER":
      return "Đội thua vòng trước";
    default:
      return "Chưa xác định";
  }
}
