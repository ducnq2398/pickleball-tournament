/**
 * Chuyển đổi giữa document Firestore và domain model.
 *
 * Cố tình KHÔNG dùng `withConverter`: repository ghi bằng payload tường minh
 * (updateDoc/transaction) nên converter tự động chỉ gây rắc rối. Ở đây chỉ có
 * các hàm parse có kiểm soát kiểu, không dùng `any`.
 */
import { Timestamp, type DocumentData, type DocumentSnapshot } from "firebase/firestore";
import type {
  AppUser,
  AuditAction,
  AuditLog,
  Court,
  CourtStatus,
  Group,
  Match,
  MatchSource,
  MatchStatus,
  Millis,
  Player,
  RankingRuleId,
  Stage,
  Team,
  Tournament,
  TournamentConfig,
  TournamentStatus,
  UserRole,
} from "@/types/tournament";
import { DEFAULT_TOURNAMENT_CONFIG } from "@/lib/tournament/tournament";

/* ------------------------------- primitives ------------------------------- */

export function toMillis(value: unknown): Millis {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function optionalMillis(value: unknown): Millis | undefined {
  const millis = toMillis(value);
  return millis === 0 ? undefined : millis;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalStr(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Loại bỏ key có giá trị undefined — Firestore từ chối undefined. */
export function clean<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/* --------------------------------- enums ---------------------------------- */

const TOURNAMENT_STATUSES: TournamentStatus[] = ["DRAFT", "GROUP_STAGE", "KNOCKOUT", "FINISHED"];
const MATCH_STATUSES: MatchStatus[] = ["SCHEDULED", "LIVE", "FINISHED", "CANCELLED"];
const STAGES: Stage[] = [
  "GROUP",
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMI_FINAL",
  "FINAL",
  "THIRD_PLACE",
];
const COURT_STATUSES: CourtStatus[] = ["AVAILABLE", "IN_USE", "PAUSED"];
const ROLES: UserRole[] = ["ADMIN", "REFEREE"];
const RANKING_RULES: RankingRuleId[] = [
  "WINS",
  "HEAD_TO_HEAD",
  "SCORE_DIFF",
  "SCORE_FOR",
  "MATCH_POINTS",
];

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

/* ------------------------------- tournament ------------------------------- */

function parseConfig(value: unknown): TournamentConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  const rules = strArray(raw.rankingRules).filter((r): r is RankingRuleId =>
    (RANKING_RULES as string[]).includes(r),
  );
  return {
    numberOfTeams: num(raw.numberOfTeams, DEFAULT_TOURNAMENT_CONFIG.numberOfTeams),
    numberOfGroups: num(raw.numberOfGroups, DEFAULT_TOURNAMENT_CONFIG.numberOfGroups),
    numberOfCourts: num(raw.numberOfCourts, DEFAULT_TOURNAMENT_CONFIG.numberOfCourts),
    groupTargetScore: num(raw.groupTargetScore, DEFAULT_TOURNAMENT_CONFIG.groupTargetScore),
    knockoutTargetScore: num(
      raw.knockoutTargetScore,
      DEFAULT_TOURNAMENT_CONFIG.knockoutTargetScore,
    ),
    winByTwo: bool(raw.winByTwo, DEFAULT_TOURNAMENT_CONFIG.winByTwo),
    playersPerTeam: num(raw.playersPerTeam, DEFAULT_TOURNAMENT_CONFIG.playersPerTeam),
    qualifiersPerGroup: num(raw.qualifiersPerGroup, DEFAULT_TOURNAMENT_CONFIG.qualifiersPerGroup),
    thirdPlaceMatch: bool(raw.thirdPlaceMatch, DEFAULT_TOURNAMENT_CONFIG.thirdPlaceMatch),
    rankingRules: rules.length ? rules : DEFAULT_TOURNAMENT_CONFIG.rankingRules,
  };
}

export function parseTournament(id: string, data: DocumentData): Tournament {
  return {
    id,
    name: str(data.name, "Giải chưa đặt tên"),
    date: optionalStr(data.date),
    location: optionalStr(data.location),
    status: oneOf(data.status, TOURNAMENT_STATUSES, "DRAFT"),
    config: parseConfig(data.config),
    championTeamId: optionalStr(data.championTeamId),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

/* ---------------------------------- team ---------------------------------- */

function parsePlayers(value: unknown): Player[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, index) => ({
      id: str(item.id, `p${index + 1}`),
      name: str(item.name),
    }));
}

export function parseTeam(id: string, data: DocumentData): Team {
  return {
    id,
    name: str(data.name, "Đội chưa đặt tên"),
    players: parsePlayers(data.players),
    groupId: optionalStr(data.groupId),
    seed: typeof data.seed === "number" ? data.seed : undefined,
    note: optionalStr(data.note),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

/* --------------------------------- group ---------------------------------- */

export function parseGroup(id: string, data: DocumentData): Group {
  return {
    id,
    name: str(data.name, "Bảng"),
    order: num(data.order),
    teamIds: strArray(data.teamIds),
    qualificationSlots: num(data.qualificationSlots, 2),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

/* --------------------------------- match ---------------------------------- */

function parseSource(value: unknown): MatchSource | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  if (type !== "TEAM" && type !== "GROUP_RANK" && type !== "MATCH_WINNER" && type !== "MATCH_LOSER") {
    return undefined;
  }
  return {
    type,
    teamId: optionalStr(raw.teamId),
    groupId: optionalStr(raw.groupId),
    rank: typeof raw.rank === "number" ? raw.rank : undefined,
    matchId: optionalStr(raw.matchId),
    label: optionalStr(raw.label),
  };
}

export function parseMatch(id: string, data: DocumentData): Match {
  return {
    id,
    code: num(data.code),
    stage: oneOf(data.stage, STAGES, "GROUP"),
    groupId: optionalStr(data.groupId),
    round: typeof data.round === "number" ? data.round : undefined,
    team1Id: optionalStr(data.team1Id),
    team2Id: optionalStr(data.team2Id),
    team1Source: parseSource(data.team1Source),
    team2Source: parseSource(data.team2Source),
    score1: num(data.score1),
    score2: num(data.score2),
    targetScore: num(data.targetScore, 11),
    winByTwo: bool(data.winByTwo, true),
    status: oneOf(data.status, MATCH_STATUSES, "SCHEDULED"),
    winnerId: optionalStr(data.winnerId),
    loserId: optionalStr(data.loserId),
    courtId: optionalStr(data.courtId),
    order: num(data.order),
    startedAt: optionalMillis(data.startedAt),
    finishedAt: optionalMillis(data.finishedAt),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

/** Dùng cho transaction: snapshot có thể chưa tồn tại. */
export function parseMatchSnapshot(snapshot: DocumentSnapshot): Match | null {
  const data = snapshot.data();
  if (!data) return null;
  return parseMatch(snapshot.id, data);
}

/* --------------------------------- court ---------------------------------- */

export function parseCourt(id: string, data: DocumentData): Court {
  return {
    id,
    name: str(data.name, "Sân"),
    number: num(data.number, 1),
    currentMatchId: optionalStr(data.currentMatchId),
    status: oneOf(data.status, COURT_STATUSES, "AVAILABLE"),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

/* ---------------------------------- user ---------------------------------- */

export function parseUser(id: string, data: DocumentData): AppUser {
  return {
    id,
    name: str(data.name, "Người dùng"),
    email: optionalStr(data.email),
    role: oneOf(data.role, ROLES, "REFEREE"),
    courtId: optionalStr(data.courtId),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

/* -------------------------------- auditLog -------------------------------- */

const AUDIT_ACTIONS: AuditAction[] = [
  "CREATE_TOURNAMENT",
  "UPDATE_TOURNAMENT",
  "START_TOURNAMENT",
  "CREATE_TEAM",
  "UPDATE_TEAM",
  "DELETE_TEAM",
  "UPDATE_GROUPS",
  "GENERATE_SCHEDULE",
  "CREATE_MATCH",
  "ASSIGN_COURT",
  "START_MATCH",
  "UPDATE_SCORE",
  "FINISH_MATCH",
  "REOPEN_MATCH",
  "CANCEL_MATCH",
  "CREATE_KNOCKOUT",
  "SYNC_KNOCKOUT",
  "SEED_DATA",
];

export function parseAuditLog(id: string, data: DocumentData): AuditLog {
  return {
    id,
    action: oneOf(data.action, AUDIT_ACTIONS, "UPDATE_SCORE"),
    matchId: optionalStr(data.matchId),
    teamId: optionalStr(data.teamId),
    previousData: data.previousData,
    newData: data.newData,
    message: optionalStr(data.message),
    userId: optionalStr(data.userId),
    userName: optionalStr(data.userName),
    createdAt: toMillis(data.createdAt),
  };
}
