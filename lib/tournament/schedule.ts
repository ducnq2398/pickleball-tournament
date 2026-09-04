/**
 * ROUND-ROBIN ENGINE — sinh lịch vòng bảng.
 *
 * Pure function, không đụng Firestore. Dùng "circle method": cố định đội đầu
 * tiên, xoay vòng các đội còn lại. Số đội lẻ thì thêm một suất BYE ảo (đội gặp
 * BYE được nghỉ lượt đó).
 *
 * Bảo đảm: mỗi cặp gặp nhau đúng 1 lần, không tự đấu với chính mình,
 * không trùng cặp — có unit test kiểm chứng (tests/schedule.test.ts).
 */
import type { Group, MatchDraft, Pairing, ValidationResult } from "@/types/tournament";
import { pairKey } from "@/lib/utils";

const BYE = "__BYE__";

/** Số trận của một bảng n đội: n * (n - 1) / 2. */
export function countRoundRobinMatches(teamCount: number): number {
  if (teamCount < 2) return 0;
  return (teamCount * (teamCount - 1)) / 2;
}

/** Số lượt đấu (round) cần thiết: n-1 nếu chẵn, n nếu lẻ. */
export function countRoundRobinRounds(teamCount: number): number {
  if (teamCount < 2) return 0;
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

/**
 * Sinh lịch vòng tròn một lượt cho danh sách đội.
 * Kết quả đã gán `round` (bắt đầu từ 1) để xếp lịch xen kẽ giữa các bảng.
 */
export function generateRoundRobinSchedule(teamIds: string[]): Pairing[] {
  const unique = Array.from(new Set(teamIds.filter(Boolean)));
  if (unique.length < 2) return [];

  const players = [...unique];
  if (players.length % 2 !== 0) players.push(BYE);

  const half = players.length / 2;
  const rotating = players.slice(1);
  const pairings: Pairing[] = [];

  for (let round = 0; round < players.length - 1; round++) {
    const left = [players[0], ...rotating.slice(0, half - 1)];
    const right = rotating.slice(half - 1).reverse();

    for (let i = 0; i < half; i++) {
      const a = left[i];
      const b = right[i];
      if (!a || !b || a === BYE || b === BYE) continue;
      // Đảo chiều sân nhà/khách theo lượt cho cân bằng thứ tự hiển thị.
      const flip = round % 2 === 1;
      pairings.push({
        round: round + 1,
        team1Id: flip ? b : a,
        team2Id: flip ? a : b,
      });
    }
    // Xoay: phần tử cuối lên đầu danh sách xoay.
    rotating.unshift(rotating.pop() as string);
  }

  return pairings;
}

/** Kiểm tra tính đúng đắn của một lịch vòng tròn (dùng cho test + UI cảnh báo). */
export function validateRoundRobin(teamIds: string[], pairings: Pairing[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unique = Array.from(new Set(teamIds));
  const seen = new Set<string>();

  for (const p of pairings) {
    if (p.team1Id === p.team2Id) errors.push(`Đội ${p.team1Id} tự đấu với chính mình.`);
    const key = pairKey(p.team1Id, p.team2Id);
    if (seen.has(key)) errors.push(`Cặp đấu bị trùng: ${p.team1Id} vs ${p.team2Id}.`);
    seen.add(key);
    if (!unique.includes(p.team1Id) || !unique.includes(p.team2Id)) {
      errors.push("Lịch chứa đội không thuộc bảng.");
    }
  }

  const expected = countRoundRobinMatches(unique.length);
  if (pairings.length !== expected) {
    errors.push(`Số trận sai: có ${pairings.length}, cần ${expected}.`);
  }
  if (unique.length < 2) warnings.push("Bảng có ít hơn 2 đội nên không sinh được trận.");

  return { ok: errors.length === 0, errors, warnings };
}

export interface GroupScheduleOptions {
  /** Bảng đấu kèm danh sách đội (theo thứ tự hiển thị). */
  groups: Pick<Group, "id" | "name" | "order" | "teamIds">[];
  targetScore: number;
  winByTwo: boolean;
  /** Danh sách sân để gán gợi ý ban đầu; rỗng thì không gán sân. */
  courtIds: string[];
  /** Số hiệu trận bắt đầu (mặc định 1). */
  startCode?: number;
}

/**
 * Sinh toàn bộ trận vòng bảng cho giải.
 *
 * Chiến lược xếp thứ tự:
 * 1. Chạy xen kẽ theo LƯỢT giữa các bảng (lượt 1 bảng A → lượt 1 bảng B → ...)
 *    để hai sân luôn có trận và các bảng kết thúc gần như cùng lúc.
 * 2. Sắp lại theo "đợt" (wave = số sân): các trận đá SONG SONG trên các sân
 *    khác nhau tuyệt đối không được dùng chung một đội.
 */
export function generateGroupSchedule(options: GroupScheduleOptions): MatchDraft[] {
  const { groups, targetScore, winByTwo, courtIds, startCode = 1 } = options;

  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  const perGroup = sortedGroups.map((group) => ({
    group,
    pairings: generateRoundRobinSchedule(group.teamIds),
  }));

  const maxRound = perGroup.reduce(
    (max, item) => Math.max(max, ...item.pairings.map((p) => p.round), 0),
    0,
  );

  const interleaved: { groupId: string; round: number; team1Id: string; team2Id: string }[] = [];

  for (let round = 1; round <= maxRound; round++) {
    for (const { group, pairings } of perGroup) {
      for (const pairing of pairings.filter((p) => p.round === round)) {
        interleaved.push({
          groupId: group.id,
          round: pairing.round,
          team1Id: pairing.team1Id,
          team2Id: pairing.team2Id,
        });
      }
    }
  }

  const waveSize = Math.max(1, courtIds.length);
  const waves = buildWaves(interleaved, waveSize);

  const drafts: MatchDraft[] = [];
  let index = 0;

  for (const wave of waves) {
    wave.forEach((item, slot) => {
      drafts.push({
        code: startCode + index,
        stage: "GROUP",
        groupId: item.groupId,
        round: item.round,
        team1Id: item.team1Id,
        team2Id: item.team2Id,
        score1: 0,
        score2: 0,
        targetScore,
        winByTwo,
        status: "SCHEDULED",
        order: index,
        courtId: courtIds.length ? courtIds[slot % courtIds.length] : undefined,
      });
      index += 1;
    });
  }

  return drafts;
}

/**
 * Gom danh sách trận thành các "đợt" (wave) chạy song song trên nhiều sân.
 *
 * Bảo đảm: trong một đợt không có đội nào xuất hiện 2 lần — tức là không bao
 * giờ xếp một đội đá 2 trận cùng lúc trên 2 sân. Đợt cuối có thể ngắn hơn số
 * sân (một sân nghỉ) khi các trận còn lại đều dùng chung đội — đó là điều
 * không tránh khỏi và đúng với thực tế.
 *
 * Thứ tự mong muốn ban đầu được giữ tối đa: chỉ "nhảy cóc" khi bị trùng đội.
 */
export function buildWaves<T extends { team1Id: string; team2Id: string }>(
  items: T[],
  waveSize: number,
): T[][] {
  const size = Math.max(1, waveSize);
  const remaining = [...items];
  const waves: T[][] = [];

  while (remaining.length) {
    const wave: T[] = [];
    const busy = new Set<string>();

    while (wave.length < size) {
      const index = remaining.findIndex(
        (item) => !busy.has(item.team1Id) && !busy.has(item.team2Id),
      );
      if (index === -1) break; // không còn trận nào ghép được vào đợt này

      const [picked] = remaining.splice(index, 1);
      wave.push(picked);
      busy.add(picked.team1Id);
      busy.add(picked.team2Id);
    }

    if (wave.length === 0) {
      // An toàn tuyệt đối: không bao giờ lặp vô hạn.
      wave.push(remaining.shift() as T);
    }
    waves.push(wave);
  }

  return waves;
}

/** Tổng số trận vòng bảng dự kiến cho cấu hình bảng hiện tại. */
export function expectedGroupMatchCount(groups: { teamIds: string[] }[]): number {
  return groups.reduce((sum, g) => sum + countRoundRobinMatches(g.teamIds.length), 0);
}
