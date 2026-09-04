/**
 * STANDINGS ENGINE — bảng xếp hạng vòng bảng.
 *
 * Standings KHÔNG được lưu trong Firestore: nó luôn được derive từ `matches`.
 * Nhờ vậy không bao giờ có chuyện BXH lệch với kết quả trận (và tiết kiệm
 * read/write). Mọi client tính lại cục bộ khi listener bắn dữ liệu mới.
 *
 * Luật xếp hạng mặc định (đổi thứ tự được qua tournament.config.rankingRules):
 *   1. Số trận thắng
 *   2. Đối đầu trực tiếp (mini-league giữa các đội đang bằng điểm)
 *   3. Hiệu số điểm
 *   4. Tổng điểm ghi được
 */
import type {
  Match,
  RankingRuleId,
  StandingRow,
  Team,
} from "@/types/tournament";
import { compareTuples, tupleKey } from "@/lib/utils";

export const DEFAULT_RANKING_RULES: RankingRuleId[] = [
  "WINS",
  "HEAD_TO_HEAD",
  "SCORE_DIFF",
  "SCORE_FOR",
];

export const RANKING_RULE_LABELS: Record<RankingRuleId, string> = {
  WINS: "Số trận thắng",
  HEAD_TO_HEAD: "Đối đầu trực tiếp",
  SCORE_DIFF: "Hiệu số điểm",
  SCORE_FOR: "Tổng điểm ghi được",
  MATCH_POINTS: "Điểm trận",
};

export const POINTS_PER_WIN = 1;
export const POINTS_PER_LOSS = 0;

/** Trận đã có kết quả chính thức và đủ 2 đội. */
function isCountable(match: Match): boolean {
  return (
    match.status === "FINISHED" &&
    !!match.team1Id &&
    !!match.team2Id &&
    !!match.winnerId
  );
}

/**
 * Tính bảng xếp hạng của một bảng đấu.
 *
 * @param groupId  Bảng cần tính.
 * @param teams    Toàn bộ đội của giải (hàm tự lọc theo bảng).
 * @param matches  Toàn bộ trận của giải (hàm tự lọc GROUP + groupId).
 */
export function calculateStandings(
  groupId: string,
  teams: Team[],
  matches: Match[],
  rules: RankingRuleId[] = DEFAULT_RANKING_RULES,
  teamIdsOverride?: string[],
): StandingRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const memberIds =
    teamIdsOverride ??
    teams.filter((t) => t.groupId === groupId).map((t) => t.id);

  const groupMatches = matches.filter(
    (m) => m.stage === "GROUP" && m.groupId === groupId && isCountable(m),
  );

  const rows = new Map<string, StandingRow>();
  for (const teamId of memberIds) {
    rows.set(teamId, {
      rank: 0,
      teamId,
      teamName: teamById.get(teamId)?.name ?? "Đội không xác định",
      groupId,
      played: 0,
      won: 0,
      lost: 0,
      matchPoints: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      diff: 0,
      tied: false,
    });
  }

  for (const match of groupMatches) {
    const row1 = rows.get(match.team1Id as string);
    const row2 = rows.get(match.team2Id as string);
    if (!row1 || !row2) continue; // trận có đội đã bị xoá khỏi bảng

    row1.played += 1;
    row2.played += 1;
    row1.scoreFor += match.score1;
    row1.scoreAgainst += match.score2;
    row2.scoreFor += match.score2;
    row2.scoreAgainst += match.score1;

    const winnerRow = match.winnerId === row1.teamId ? row1 : row2;
    const loserRow = winnerRow === row1 ? row2 : row1;
    winnerRow.won += 1;
    loserRow.lost += 1;
  }

  for (const row of rows.values()) {
    row.diff = row.scoreFor - row.scoreAgainst;
    row.matchPoints = row.won * POINTS_PER_WIN + row.lost * POINTS_PER_LOSS;
  }

  return sortStandings([...rows.values()], groupMatches, rules);
}

/** Chỉ số dùng để so sánh theo từng tiêu chí (tuple: phần tử càng lớn càng tốt). */
function metricFor(
  rule: RankingRuleId,
  row: StandingRow,
  bucket: StandingRow[],
  matches: Match[],
): number[] {
  switch (rule) {
    case "WINS":
      return [row.won];
    case "MATCH_POINTS":
      return [row.matchPoints];
    case "SCORE_DIFF":
      return [row.diff];
    case "SCORE_FOR":
      return [row.scoreFor];
    case "HEAD_TO_HEAD":
      return headToHeadMetric(row.teamId, bucket, matches);
    default:
      return [0];
  }
}

/**
 * Mini-league giữa các đội đang bằng chỉ số: chỉ tính các trận mà CẢ HAI đội
 * đều nằm trong nhóm đang xét. Trả về [số trận thắng, hiệu số, điểm ghi].
 */
function headToHeadMetric(teamId: string, bucket: StandingRow[], matches: Match[]): number[] {
  const ids = new Set(bucket.map((r) => r.teamId));
  if (ids.size < 2) return [0, 0, 0];

  let wins = 0;
  let scoreFor = 0;
  let scoreAgainst = 0;

  for (const match of matches) {
    if (!isCountable(match)) continue;
    const t1 = match.team1Id as string;
    const t2 = match.team2Id as string;
    if (!ids.has(t1) || !ids.has(t2)) continue;
    if (t1 !== teamId && t2 !== teamId) continue;

    const isTeam1 = t1 === teamId;
    scoreFor += isTeam1 ? match.score1 : match.score2;
    scoreAgainst += isTeam1 ? match.score2 : match.score1;
    if (match.winnerId === teamId) wins += 1;
  }

  return [wins, scoreFor - scoreAgainst, scoreFor];
}

/**
 * Sắp xếp BXH theo thứ tự tiêu chí, đệ quy: các đội bằng nhau ở tiêu chí trước
 * sẽ được tách bằng tiêu chí sau. Đối đầu trực tiếp luôn tính trong phạm vi
 * nhóm đang bằng nhau — đúng như luật giải đấu.
 */
export function sortStandings(
  rows: StandingRow[],
  matches: Match[],
  rules: RankingRuleId[] = DEFAULT_RANKING_RULES,
): StandingRow[] {
  const ordered = resolveBucket([...rows], matches, rules, 0);
  ordered.forEach((row, index) => {
    row.rank = index + 1;
  });
  return ordered;
}

function resolveBucket(
  bucket: StandingRow[],
  matches: Match[],
  rules: RankingRuleId[],
  ruleIndex: number,
): StandingRow[] {
  if (bucket.length <= 1) return bucket;

  if (ruleIndex >= rules.length) {
    // Hết tiêu chí: giữ thứ tự ổn định theo tên để không nhảy lung tung giữa các render.
    const stable = [...bucket].sort((a, b) => a.teamName.localeCompare(b.teamName, "vi"));
    for (const row of stable) row.tied = true;
    return stable;
  }

  const rule = rules[ruleIndex];
  const scored = bucket.map((row) => ({
    row,
    metric: metricFor(rule, row, bucket, matches),
  }));
  scored.sort((a, b) => compareTuples(a.metric, b.metric));

  const groupsByMetric: { key: string; rows: StandingRow[] }[] = [];
  for (const item of scored) {
    const key = tupleKey(item.metric);
    const last = groupsByMetric[groupsByMetric.length - 1];
    if (last && last.key === key) last.rows.push(item.row);
    else groupsByMetric.push({ key, rows: [item.row] });
  }

  const result: StandingRow[] = [];
  const splitHappened = groupsByMetric.length > 1;

  for (const g of groupsByMetric) {
    if (g.rows.length === 1) {
      const row = g.rows[0];
      if (splitHappened && ruleIndex > 0) {
        row.tied = true;
        row.tiebreakReason = RANKING_RULE_LABELS[rule];
      }
      result.push(row);
    } else {
      for (const row of g.rows) row.tied = true;
      result.push(...resolveBucket(g.rows, matches, rules, ruleIndex + 1));
    }
  }

  return result;
}

/** BXH của tất cả các bảng: Map<groupId, rows>. */
export function calculateAllStandings(
  groups: { id: string; teamIds: string[] }[],
  teams: Team[],
  matches: Match[],
  rules: RankingRuleId[] = DEFAULT_RANKING_RULES,
): Map<string, StandingRow[]> {
  const result = new Map<string, StandingRow[]>();
  for (const group of groups) {
    result.set(
      group.id,
      calculateStandings(group.id, teams, matches, rules, group.teamIds),
    );
  }
  return result;
}

/** Đội đứng thứ `rank` (1-based) của một bảng, undefined nếu chưa đủ đội. */
export function getTeamAtRank(rows: StandingRow[], rank: number): StandingRow | undefined {
  return rows.find((row) => row.rank === rank);
}

/** Danh sách đội đi tiếp của một bảng. */
export function getQualifiedTeams(rows: StandingRow[], slots: number): StandingRow[] {
  return rows.slice(0, Math.max(0, slots));
}

/**
 * BXH đã "chốt" chưa? Chỉ khi mọi trận của bảng đã FINISHED thì thứ hạng mới
 * được dùng để tạo knockout.
 */
export function isGroupComplete(groupId: string, matches: Match[]): boolean {
  const groupMatches = matches.filter((m) => m.stage === "GROUP" && m.groupId === groupId);
  if (groupMatches.length === 0) return false;
  return groupMatches.every((m) => m.status === "FINISHED" || m.status === "CANCELLED");
}
