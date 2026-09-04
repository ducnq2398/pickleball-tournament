/**
 * Kiểu dữ liệu trung tâm của toàn hệ thống.
 *
 * Nguyên tắc kiến trúc: file này KHÔNG import gì từ React/Next/Firebase.
 * Toàn bộ business logic (scoring / standings / schedule / knockout) chỉ phụ
 * thuộc vào các type ở đây nên đều là pure function, test được bằng Vitest.
 *
 * Về thời gian: Firestore lưu `Timestamp`, nhưng domain model dùng epoch
 * milliseconds (number) — converter ở lib/firestore/converters.ts chịu trách
 * nhiệm chuyển đổi. Nhờ vậy dữ liệu luôn serialize được và không lệch
 * hydration giữa server/client.
 */

/** Epoch milliseconds. */
export type Millis = number;

/** Vòng đời của giải. */
export type TournamentStatus = "DRAFT" | "GROUP_STAGE" | "KNOCKOUT" | "FINISHED";

/** Vòng đấu của một trận. */
export type Stage =
  | "GROUP"
  | "ROUND_OF_16"
  | "QUARTER_FINAL"
  | "SEMI_FINAL"
  | "FINAL"
  | "THIRD_PLACE";

/** Trạng thái của một trận. */
export type MatchStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "CANCELLED";

/** Trạng thái của một sân. */
export type CourtStatus = "AVAILABLE" | "IN_USE" | "PAUSED";

/** Vai trò người dùng. Public không cần tài khoản. */
export type UserRole = "ADMIN" | "REFEREE";

/** Vị trí đội trong một trận: 1 = team1, 2 = team2. */
export type TeamSlot = 1 | 2;

/* -------------------------------------------------------------------------- */
/* Tournament                                                                 */
/* -------------------------------------------------------------------------- */

/** Id các tiêu chí xếp hạng, xem lib/tournament/standings.ts */
export type RankingRuleId =
  | "WINS"
  | "HEAD_TO_HEAD"
  | "SCORE_DIFF"
  | "SCORE_FOR"
  | "MATCH_POINTS";

export interface TournamentConfig {
  numberOfTeams: number;
  numberOfGroups: number;
  numberOfCourts: number;

  /** Điểm chạm vòng bảng (mặc định 11). */
  groupTargetScore: number;
  /** Điểm chạm vòng knockout (mặc định 15). */
  knockoutTargetScore: number;
  /** Bắt buộc thắng cách biệt 2 điểm (deuce). */
  winByTwo: boolean;

  /** Số VĐV mỗi đội (Pickleball đôi = 2, cho phép đổi sau này). */
  playersPerTeam: number;
  /** Số đội đi tiếp mỗi bảng (mặc định 2 = Nhất + Nhì). */
  qualifiersPerGroup: number;
  /** Có đá tranh hạng 3 hay không. */
  thirdPlaceMatch: boolean;

  /** Thứ tự ưu tiên các tiêu chí xếp hạng — đổi được mà không sửa code. */
  rankingRules: RankingRuleId[];
}

export interface Tournament {
  id: string;
  name: string;
  date?: string;
  location?: string;

  status: TournamentStatus;
  config: TournamentConfig;

  /** Id trận chung kết đã xác định nhà vô địch (tiện cho trang /champion). */
  championTeamId?: string;

  createdAt: Millis;
  updatedAt: Millis;
}

/* -------------------------------------------------------------------------- */
/* Teams & Groups                                                             */
/* -------------------------------------------------------------------------- */

export interface Player {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  players: Player[];

  /** Bảng đấu đội thuộc về (undefined = chưa xếp bảng). */
  groupId?: string;
  /** Hạt giống, dùng khi auto chia bảng. */
  seed?: number;
  /** Ghi chú tuỳ ý của BTC (CLB, số áo...). */
  note?: string;

  createdAt: Millis;
  updatedAt: Millis;
}

export interface Group {
  id: string;
  name: string;
  order: number;

  /** Nguồn sự thật về thành phần + thứ tự đội trong bảng. */
  teamIds: string[];
  /** Số suất đi tiếp của bảng. */
  qualificationSlots: number;

  createdAt: Millis;
  updatedAt: Millis;
}

/* -------------------------------------------------------------------------- */
/* Matches                                                                    */
/* -------------------------------------------------------------------------- */

export type MatchSourceType = "TEAM" | "GROUP_RANK" | "MATCH_WINNER" | "MATCH_LOSER";

/**
 * Nguồn của một suất trong trận. Nhờ nó vòng knockout tự điền đội:
 * "Nhất bảng A" (GROUP_RANK) hoặc "Thắng bán kết 1" (MATCH_WINNER).
 */
export interface MatchSource {
  type: MatchSourceType;
  /** type = TEAM */
  teamId?: string;
  /** type = GROUP_RANK */
  groupId?: string;
  rank?: number;
  /** type = MATCH_WINNER | MATCH_LOSER */
  matchId?: string;
  /** Nhãn hiển thị khi đội chưa xác định: "Nhất bảng A". */
  label?: string;
}

export interface Match {
  id: string;
  /** Số hiệu hiển thị cho trọng tài: "TRẬN #12". */
  code: number;

  stage: Stage;

  /** Chỉ có ở vòng bảng. */
  groupId?: string;
  /** Lượt đấu của vòng tròn (dùng để xếp lịch xen kẽ). */
  round?: number;

  /** Rỗng/undefined khi đội chưa được xác định (knockout chờ kết quả). */
  team1Id?: string;
  team2Id?: string;

  team1Source?: MatchSource;
  team2Source?: MatchSource;

  score1: number;
  score2: number;

  /** Điểm chạm áp dụng cho trận này (chốt lúc tạo trận). */
  targetScore: number;
  winByTwo: boolean;

  status: MatchStatus;
  winnerId?: string;
  loserId?: string;

  courtId?: string;

  /** Thứ tự thi đấu dự kiến. */
  order: number;

  startedAt?: Millis;
  finishedAt?: Millis;

  createdAt: Millis;
  updatedAt: Millis;
}

/** Dữ liệu tạo trận mới (chưa có id/timestamps) — do engine sinh ra. */
export type MatchDraft = Omit<Match, "id" | "createdAt" | "updatedAt">;

/* -------------------------------------------------------------------------- */
/* Courts                                                                     */
/* -------------------------------------------------------------------------- */

export interface Court {
  id: string;
  name: string;
  number: number;

  currentMatchId?: string;
  status: CourtStatus;

  createdAt: Millis;
  updatedAt: Millis;
}

/* -------------------------------------------------------------------------- */
/* Users & Audit log                                                          */
/* -------------------------------------------------------------------------- */

export interface AppUser {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  /** Sân được phân công (chỉ dùng gợi ý cho trọng tài). */
  courtId?: string;
  createdAt: Millis;
  updatedAt: Millis;
}

export type AuditAction =
  | "CREATE_TOURNAMENT"
  | "UPDATE_TOURNAMENT"
  | "START_TOURNAMENT"
  | "CREATE_TEAM"
  | "UPDATE_TEAM"
  | "DELETE_TEAM"
  | "UPDATE_GROUPS"
  | "GENERATE_SCHEDULE"
  | "CREATE_MATCH"
  | "ASSIGN_COURT"
  | "START_MATCH"
  | "UPDATE_SCORE"
  | "FINISH_MATCH"
  | "REOPEN_MATCH"
  | "CANCEL_MATCH"
  | "CREATE_KNOCKOUT"
  | "SYNC_KNOCKOUT"
  | "SEED_DATA";

export interface AuditLog {
  id: string;
  action: AuditAction;

  matchId?: string;
  teamId?: string;

  previousData?: unknown;
  newData?: unknown;

  /** Mô tả tiếng Việt để BTC đọc nhanh. */
  message?: string;

  userId?: string;
  userName?: string;

  createdAt: Millis;
}

/* -------------------------------------------------------------------------- */
/* Kết quả của các engine (pure functions)                                    */
/* -------------------------------------------------------------------------- */

/** Kết quả kiểm tra hợp lệ dùng chung cho toàn bộ engine. */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Kết quả tính thắng/thua của một trận. */
export interface MatchOutcome {
  /** Trận đã đủ điều kiện kết thúc theo luật hay chưa. */
  isComplete: boolean;
  winnerId?: string;
  loserId?: string;
  targetScore: number;
  /** Mô tả tiếng Việt để hiển thị trên UI. */
  reason: string;
}

/** Một dòng của bảng xếp hạng. */
export interface StandingRow {
  rank: number;
  teamId: string;
  teamName: string;
  groupId?: string;

  played: number;
  won: number;
  lost: number;

  /** Điểm trận: thắng 1 / thua 0 (đổi được ở sortStandings). */
  matchPoints: number;

  scoreFor: number;
  scoreAgainst: number;
  diff: number;

  /** true nếu phải dùng tiêu chí phụ để phân định với đội liền kề. */
  tied: boolean;
  /** Tiêu chí đã dùng để tách khỏi đội trên: "Đối đầu", "Hiệu số"... */
  tiebreakReason?: string;
}

/** Một cặp đấu do engine round-robin sinh ra. */
export interface Pairing {
  round: number;
  team1Id: string;
  team2Id: string;
}

/** Thống kê tiến độ giải, hiển thị ở dashboard. */
export interface TournamentProgress {
  total: number;
  finished: number;
  live: number;
  scheduled: number;
  remaining: number;
}
