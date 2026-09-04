/**
 * Cấu hình mặc định + các helper thuần tuý dùng chung cho toàn giải.
 * Mọi con số (số đội, số bảng, số sân, điểm chạm) đều lấy từ tournament.config,
 * KHÔNG hard-code trong business logic hay UI.
 */
import type {
  Court,
  Group,
  Match,
  MatchStatus,
  Stage,
  Team,
  Tournament,
  TournamentConfig,
  TournamentProgress,
  TournamentStatus,
} from "@/types/tournament";
import { DEFAULT_RANKING_RULES } from "./standings";
import { isKnockoutStage } from "./knockout";

/** Cấu hình mặc định — khớp với giải đang tổ chức (9 đội / 2 bảng / 2 sân). */
export const DEFAULT_TOURNAMENT_CONFIG: TournamentConfig = {
  numberOfTeams: 9,
  numberOfGroups: 2,
  numberOfCourts: 2,
  groupTargetScore: 11,
  knockoutTargetScore: 15,
  winByTwo: true,
  playersPerTeam: 2,
  qualifiersPerGroup: 2,
  thirdPlaceMatch: false,
  rankingRules: DEFAULT_RANKING_RULES,
};

export function createTournamentConfig(
  overrides: Partial<TournamentConfig> = {},
): TournamentConfig {
  return { ...DEFAULT_TOURNAMENT_CONFIG, ...overrides };
}

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  DRAFT: "Nháp",
  GROUP_STAGE: "Vòng bảng",
  KNOCKOUT: "Vòng knockout",
  FINISHED: "Đã kết thúc",
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  SCHEDULED: "Chưa đấu",
  LIVE: "Đang đấu",
  FINISHED: "Đã xong",
  CANCELLED: "Đã huỷ",
};

/** Vòng đời hợp lệ của giải: chỉ được đi tới, không lùi tuỳ tiện. */
export const TOURNAMENT_FLOW: TournamentStatus[] = [
  "DRAFT",
  "GROUP_STAGE",
  "KNOCKOUT",
  "FINISHED",
];

export function canTransitionTournament(
  from: TournamentStatus,
  to: TournamentStatus,
): boolean {
  return TOURNAMENT_FLOW.indexOf(to) === TOURNAMENT_FLOW.indexOf(from) + 1;
}

/** Tên bảng theo chỉ số: 0 → "A", 1 → "B", ... 26 → "AA". */
export function groupLetter(index: number): string {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

export function groupDisplayName(index: number): string {
  return `Bảng ${groupLetter(index)}`;
}

export function courtDisplayName(number: number): string {
  return `Sân ${number}`;
}

/** Điểm chạm áp dụng cho một vòng đấu. */
export function getTargetScore(config: TournamentConfig, stage: Stage): number {
  return isKnockoutStage(stage) ? config.knockoutTargetScore : config.groupTargetScore;
}

/**
 * Chia đội vào các bảng theo kiểu "rắn bò" (snake) để cân bằng hạt giống.
 * 9 đội / 2 bảng → bảng A 5 đội, bảng B 4 đội.
 */
export function distributeTeams(teamIds: string[], groupCount: number): string[][] {
  const groups: string[][] = Array.from({ length: Math.max(1, groupCount) }, () => []);
  if (groupCount < 1) return groups;

  let direction = 1;
  let index = 0;

  for (const teamId of teamIds) {
    groups[index].push(teamId);
    if (groupCount === 1) continue;

    if (direction === 1) {
      if (index === groupCount - 1) direction = -1;
      else index += 1;
    } else {
      if (index === 0) direction = 1;
      else index -= 1;
    }
  }
  return groups;
}

/** Tiến độ thi đấu, lọc theo vòng nếu cần. */
export function getProgress(matches: Match[], filter?: (m: Match) => boolean): TournamentProgress {
  const list = filter ? matches.filter(filter) : matches;
  const finished = list.filter((m) => m.status === "FINISHED").length;
  const live = list.filter((m) => m.status === "LIVE").length;
  const scheduled = list.filter((m) => m.status === "SCHEDULED").length;
  return {
    total: list.length,
    finished,
    live,
    scheduled,
    remaining: list.length - finished,
  };
}

export const isGroupMatch = (m: Match) => m.stage === "GROUP";
export const isKnockoutMatch = (m: Match) => isKnockoutStage(m.stage);

export function getLiveMatches(matches: Match[]): Match[] {
  return matches.filter((m) => m.status === "LIVE").sort((a, b) => a.order - b.order);
}

export function getMatchOnCourt(matches: Match[], courtId: string): Match | undefined {
  return matches.find((m) => m.courtId === courtId && m.status === "LIVE");
}

/** Trận kế tiếp nên gọi ra sân: chưa đấu, đã đủ đội, sắp theo thứ tự. */
export function getUpcomingMatches(matches: Match[], courtId?: string): Match[] {
  return matches
    .filter((m) => m.status === "SCHEDULED" && m.team1Id && m.team2Id)
    .filter((m) => (courtId ? !m.courtId || m.courtId === courtId : true))
    .sort((a, b) => a.order - b.order);
}

export function getRecentResults(matches: Match[], limit = 8): Match[] {
  return matches
    .filter((m) => m.status === "FINISHED")
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, limit);
}

/** Map tra tên đội nhanh cho UI. */
export function teamNameMap(teams: Team[]): Map<string, string> {
  return new Map(teams.map((t) => [t.id, t.name]));
}

export function findTeam(teams: Team[], teamId?: string): Team | undefined {
  if (!teamId) return undefined;
  return teams.find((t) => t.id === teamId);
}

export function findGroup(groups: Group[], groupId?: string): Group | undefined {
  if (!groupId) return undefined;
  return groups.find((g) => g.id === groupId);
}

export function findCourt(courts: Court[], courtId?: string): Court | undefined {
  if (!courtId) return undefined;
  return courts.find((c) => c.id === courtId);
}

/**
 * Tra sân theo tham số URL: chấp nhận cả id document ("court-1") lẫn số sân ("1").
 */
export function findCourtByParam(courts: Court[], param: string): Court | undefined {
  const byId = courts.find((c) => c.id === param);
  if (byId) return byId;
  const asNumber = Number(param);
  if (!Number.isNaN(asNumber)) return courts.find((c) => c.number === asNumber);
  return undefined;
}

/** Thành phần đội của bảng: ưu tiên group.teamIds, fallback team.groupId. */
export function getGroupTeamIds(group: Group, teams: Team[]): string[] {
  if (group.teamIds?.length) return group.teamIds;
  return teams.filter((t) => t.groupId === group.id).map((t) => t.id);
}

export function getUnassignedTeams(teams: Team[], groups: Group[]): Team[] {
  const assigned = new Set(groups.flatMap((g) => g.teamIds ?? []));
  return teams.filter((t) => !assigned.has(t.id));
}

/** Tên hiển thị của giải khi chưa có dữ liệu. */
export function tournamentTitle(tournament?: Tournament | null): string {
  return tournament?.name?.trim() || "Giải Pickleball";
}
