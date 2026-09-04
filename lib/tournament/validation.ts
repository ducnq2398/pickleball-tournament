/**
 * VALIDATION — các "cửa khoá" nghiệp vụ.
 *
 * Mọi nút bấm nguy hiểm trên UI đều phải hỏi các hàm này trước, và repository
 * kiểm tra lại lần nữa trước khi ghi Firestore. UI chỉ hiển thị lý do.
 */
import type {
  Court,
  Group,
  Match,
  Team,
  Tournament,
  ValidationResult,
} from "@/types/tournament";
import { expectedGroupMatchCount } from "./schedule";
import { isKnockoutStage, validateKnockoutPlan } from "./knockout";
import { canFinishMatch } from "./scoring";

const pass = (warnings: string[] = []): ValidationResult => ({
  ok: true,
  errors: [],
  warnings,
});

function result(errors: string[], warnings: string[] = []): ValidationResult {
  return { ok: errors.length === 0, errors, warnings };
}

/* -------------------------------------------------------------------------- */
/* Teams                                                                      */
/* -------------------------------------------------------------------------- */

export function validateTeamInput(
  name: string,
  playerNames: string[],
  existingTeams: Team[],
  editingTeamId?: string,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = name.trim();

  if (!trimmed) errors.push("Tên đội không được để trống.");
  if (trimmed.length > 60) errors.push("Tên đội quá dài (tối đa 60 ký tự).");

  const duplicated = existingTeams.some(
    (t) => t.id !== editingTeamId && t.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (duplicated) errors.push(`Đã có đội tên "${trimmed}".`);

  const filled = playerNames.map((p) => p.trim()).filter(Boolean);
  if (filled.length === 0) warnings.push("Đội chưa có tên vận động viên nào.");

  return result(errors, warnings);
}

/** Đội đã thi đấu thì xoá là nguy hiểm — trả về warning để UI hỏi lại. */
export function canDeleteTeam(teamId: string, matches: Match[]): ValidationResult {
  const played = matches.filter(
    (m) => (m.team1Id === teamId || m.team2Id === teamId) && m.status !== "SCHEDULED",
  );
  const scheduled = matches.filter(
    (m) => (m.team1Id === teamId || m.team2Id === teamId) && m.status === "SCHEDULED",
  );

  const warnings: string[] = [];
  if (played.length) {
    warnings.push(
      `Đội này đã có ${played.length} trận có dữ liệu thi đấu. Xoá sẽ làm sai bảng xếp hạng.`,
    );
  }
  if (scheduled.length) {
    warnings.push(`Đội này còn ${scheduled.length} trận trong lịch — các trận đó sẽ bị xoá theo.`);
  }
  return pass(warnings);
}

/* -------------------------------------------------------------------------- */
/* Groups & schedule                                                          */
/* -------------------------------------------------------------------------- */

export function validateGroupSetup(groups: Group[], teams: Team[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (groups.length === 0) errors.push("Chưa có bảng đấu nào.");

  const seen = new Map<string, string>();
  for (const group of groups) {
    if (group.teamIds.length < 2) {
      errors.push(`${group.name} cần ít nhất 2 đội.`);
    }
    for (const teamId of group.teamIds) {
      const other = seen.get(teamId);
      if (other) {
        errors.push(`Một đội đang nằm ở cả ${other} và ${group.name}.`);
      }
      seen.set(teamId, group.name);
      if (!teams.some((t) => t.id === teamId)) {
        errors.push(`${group.name} chứa đội không còn tồn tại.`);
      }
    }
    if (group.qualificationSlots > group.teamIds.length) {
      errors.push(`${group.name} có số suất đi tiếp lớn hơn số đội.`);
    }
  }

  const unassigned = teams.filter((t) => !seen.has(t.id));
  if (unassigned.length) {
    warnings.push(`Còn ${unassigned.length} đội chưa được xếp bảng.`);
  }

  return result(errors, warnings);
}

export function canGenerateSchedule(groups: Group[], teams: Team[], matches: Match[]): ValidationResult {
  const base = validateGroupSetup(groups, teams);
  const warnings = [...base.warnings];

  const played = matches.filter((m) => m.stage === "GROUP" && m.status !== "SCHEDULED");
  if (played.length) {
    warnings.push(
      `Đã có ${played.length} trận vòng bảng diễn ra. Sinh lại lịch sẽ XOÁ toàn bộ kết quả này.`,
    );
  }
  const knockout = matches.filter((m) => isKnockoutStage(m.stage));
  if (knockout.length) {
    warnings.push("Nhánh knockout hiện tại sẽ bị xoá và phải tạo lại.");
  }
  return { ok: base.ok, errors: base.errors, warnings };
}

/* -------------------------------------------------------------------------- */
/* Tournament lifecycle                                                       */
/* -------------------------------------------------------------------------- */

export function canStartTournament(
  tournament: Tournament,
  teams: Team[],
  groups: Group[],
  courts: Court[],
  matches: Match[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (tournament.status !== "DRAFT") {
    errors.push("Giải đã bắt đầu rồi.");
  }
  if (teams.length < 2) errors.push("Cần ít nhất 2 đội.");
  if (groups.length === 0) errors.push("Chưa tạo bảng đấu.");
  if (courts.length === 0) errors.push("Chưa có sân thi đấu.");

  const setup = validateGroupSetup(groups, teams);
  errors.push(...setup.errors);
  warnings.push(...setup.warnings);

  const groupMatches = matches.filter((m) => m.stage === "GROUP");
  const expected = expectedGroupMatchCount(groups);
  if (groupMatches.length === 0) {
    errors.push("Chưa sinh lịch vòng bảng.");
  } else if (groupMatches.length !== expected) {
    errors.push(
      `Lịch hiện có ${groupMatches.length} trận nhưng cấu hình bảng cần ${expected} trận. ` +
        `Hãy sinh lại lịch.`,
    );
  }

  return result(errors, warnings);
}

export function getRemainingGroupMatches(matches: Match[]): Match[] {
  return matches.filter((m) => m.stage === "GROUP" && m.status !== "FINISHED" && m.status !== "CANCELLED");
}

export function canCreateKnockout(
  tournament: Tournament,
  groups: Group[],
  matches: Match[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const groupMatches = matches.filter((m) => m.stage === "GROUP");
  if (groupMatches.length === 0) {
    errors.push("Chưa có trận vòng bảng nào.");
  }

  const remaining = getRemainingGroupMatches(matches);
  if (remaining.length > 0) {
    errors.push(
      `Còn ${remaining.length} trận vòng bảng chưa hoàn thành. Chưa thể tạo Knockout.`,
    );
  }

  const plan = validateKnockoutPlan(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      order: g.order,
      qualificationSlots: g.qualificationSlots,
    })),
  );
  errors.push(...plan.errors);
  warnings.push(...plan.warnings);

  if (matches.some((m) => isKnockoutStage(m.stage))) {
    warnings.push("Nhánh knockout cũ sẽ bị xoá và tạo lại.");
  }
  if (tournament.status === "FINISHED") {
    warnings.push("Giải đang ở trạng thái ĐÃ KẾT THÚC — tạo lại knockout sẽ mở lại giải.");
  }

  return result(errors, warnings);
}

/* -------------------------------------------------------------------------- */
/* Court & match flow                                                         */
/* -------------------------------------------------------------------------- */

/** Không cho 2 trận LIVE cùng một sân. */
export function canAssignCourt(
  match: Match,
  courtId: string | undefined,
  matches: Match[],
): ValidationResult {
  if (!courtId) return pass();
  if (match.status === "FINISHED") {
    return result(["Trận đã kết thúc, không cần đổi sân."]);
  }
  const busy = matches.find(
    (m) => m.id !== match.id && m.courtId === courtId && m.status === "LIVE",
  );
  if (busy && match.status === "LIVE") {
    return result([`Sân này đang có trận #${busy.code} thi đấu.`]);
  }
  if (busy) {
    return pass([`Sân đang bận với trận #${busy.code} — trận này sẽ xếp hàng chờ.`]);
  }
  return pass();
}

export function canStartMatch(match: Match, matches: Match[]): ValidationResult {
  const errors: string[] = [];

  if (match.status === "LIVE") errors.push("Trận đang diễn ra rồi.");
  if (match.status === "FINISHED") errors.push("Trận đã kết thúc. Cần MỞ LẠI TRẬN trước.");
  if (match.status === "CANCELLED") errors.push("Trận đã bị huỷ.");
  if (!match.team1Id || !match.team2Id) {
    errors.push("Trận chưa xác định đủ 2 đội (chờ kết quả vòng trước).");
  }
  if (match.team1Id && match.team1Id === match.team2Id) {
    errors.push("Hai đội trong trận đang trùng nhau.");
  }

  if (match.courtId) {
    const busy = matches.find(
      (m) => m.id !== match.id && m.courtId === match.courtId && m.status === "LIVE",
    );
    if (busy) errors.push(`Sân đang có trận #${busy.code} thi đấu. Hãy kết thúc trận đó trước.`);
  } else {
    return result(errors, ["Trận chưa được phân sân."]);
  }

  const teamBusy = matches.find(
    (m) =>
      m.id !== match.id &&
      m.status === "LIVE" &&
      [m.team1Id, m.team2Id].some((id) => id && (id === match.team1Id || id === match.team2Id)),
  );
  if (teamBusy) {
    errors.push(`Một đội trong trận đang thi đấu ở trận #${teamBusy.code}.`);
  }

  return result(errors);
}

export { canFinishMatch };

export function canReopenMatch(match: Match, matches: Match[]): ValidationResult {
  const warnings: string[] = [];
  if (match.status !== "FINISHED") {
    return result(["Chỉ mở lại được trận đã kết thúc."]);
  }
  if (isKnockoutStage(match.stage)) {
    warnings.push(
      "Đây là trận knockout — các trận sau phụ thuộc kết quả này sẽ bị đặt lại về trạng thái chưa đấu.",
    );
  } else if (matches.some((m) => isKnockoutStage(m.stage))) {
    warnings.push("Nhánh knockout đã tạo — sửa kết quả vòng bảng có thể làm sai đội đi tiếp.");
  }
  return pass(warnings);
}

/** Kiểm tra tổng thể trước khi hiển thị nút "Kết thúc giải". */
export function canFinishTournament(matches: Match[]): ValidationResult {
  const final = matches.find((m) => m.stage === "FINAL");
  if (!final) return result(["Chưa có trận chung kết."]);
  if (final.status !== "FINISHED") return result(["Trận chung kết chưa kết thúc."]);
  return pass();
}
