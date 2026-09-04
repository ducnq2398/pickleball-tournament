import { describe, expect, it } from "vitest";
import type { Court, Group, Team, Tournament } from "@/types/tournament";
import {
  canAssignCourt,
  canCreateKnockout,
  canDeleteTeam,
  canGenerateSchedule,
  canReopenMatch,
  canStartMatch,
  canStartTournament,
  validateGroupSetup,
  validateTeamInput,
} from "@/lib/tournament/validation";
import { createTournamentConfig } from "@/lib/tournament/tournament";
import { finishedMatch, makeGroup, makeMatch, makeTeam } from "./helpers";

const tournament: Tournament = {
  id: "t1",
  name: "Giải test",
  status: "DRAFT",
  config: createTournamentConfig(),
  createdAt: 0,
  updatedAt: 0,
};

const courts: Court[] = [
  { id: "c1", name: "Sân 1", number: 1, status: "AVAILABLE", createdAt: 0, updatedAt: 0 },
  { id: "c2", name: "Sân 2", number: 2, status: "AVAILABLE", createdAt: 0, updatedAt: 0 },
];

describe("validateTeamInput", () => {
  const teams = [makeTeam("a", "Đội A")];

  it("chặn tên rỗng và tên trùng", () => {
    expect(validateTeamInput("", ["x"], teams).ok).toBe(false);
    expect(validateTeamInput("đội a", ["x"], teams).ok).toBe(false);
    expect(validateTeamInput("Đội B", ["x"], teams).ok).toBe(true);
  });

  it("cho phép sửa chính đội đó mà không báo trùng", () => {
    expect(validateTeamInput("Đội A", ["x"], teams, "a").ok).toBe(true);
  });

  it("cảnh báo khi đội chưa có VĐV", () => {
    expect(validateTeamInput("Đội C", ["", ""], teams).warnings).toHaveLength(1);
  });
});

describe("canDeleteTeam", () => {
  it("cảnh báo mạnh khi đội đã có trận đã đấu", () => {
    const matches = [finishedMatch("a", "b", 11, 5), makeMatch({ team1Id: "a", team2Id: "c" })];
    const result = canDeleteTeam("a", matches);
    expect(result.ok).toBe(true); // vẫn cho xoá, nhưng phải confirm
    expect(result.warnings.join(" ")).toContain("dữ liệu thi đấu");
    expect(result.warnings.join(" ")).toContain("1 trận trong lịch");
  });

  it("không cảnh báo với đội chưa thi đấu", () => {
    expect(canDeleteTeam("z", []).warnings).toHaveLength(0);
  });
});

describe("validateGroupSetup", () => {
  const teams = ["a", "b", "c", "d"].map((id) => makeTeam(id));

  it("chặn bảng dưới 2 đội và đội nằm ở 2 bảng", () => {
    const groups: Group[] = [makeGroup("g1", "Bảng A", ["a"]), makeGroup("g2", "Bảng B", ["a", "b"])];
    const result = validateGroupSetup(groups, teams);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("ít nhất 2 đội");
    expect(result.errors.join(" ")).toContain("cả Bảng A và Bảng B");
  });

  it("cảnh báo đội chưa xếp bảng", () => {
    const groups = [makeGroup("g1", "Bảng A", ["a", "b"])];
    const result = validateGroupSetup(groups, teams);
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toContain("2 đội chưa được xếp bảng");
  });

  it("chặn số suất đi tiếp lớn hơn số đội", () => {
    const groups = [{ ...makeGroup("g1", "Bảng A", ["a", "b"]), qualificationSlots: 3 }];
    expect(validateGroupSetup(groups, teams).ok).toBe(false);
  });
});

describe("canStartTournament", () => {
  const teams = ["a", "b", "c", "d"].map((id) => makeTeam(id));
  const groups = [makeGroup("g1", "Bảng A", ["a", "b"], 0), makeGroup("g2", "Bảng B", ["c", "d"], 1)];
  const matches = [
    makeMatch({ groupId: "g1", team1Id: "a", team2Id: "b" }),
    makeMatch({ groupId: "g2", team1Id: "c", team2Id: "d" }),
  ];

  it("chặn khi chưa sinh lịch", () => {
    const result = canStartTournament(tournament, teams, groups, courts, []);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Chưa sinh lịch");
  });

  it("chặn khi số trận không khớp cấu hình bảng", () => {
    const result = canStartTournament(tournament, teams, groups, courts, [matches[0]]);
    expect(result.errors.join(" ")).toContain("cần 2 trận");
  });

  it("chặn khi chưa có sân", () => {
    expect(canStartTournament(tournament, teams, groups, [], matches).ok).toBe(false);
  });

  it("cho phép khi đủ điều kiện", () => {
    expect(canStartTournament(tournament, teams, groups, courts, matches).ok).toBe(true);
  });

  it("không cho bắt đầu lại giải đã chạy", () => {
    const running = { ...tournament, status: "GROUP_STAGE" as const };
    expect(canStartTournament(running, teams, groups, courts, matches).ok).toBe(false);
  });
});

describe("canAssignCourt / canStartMatch — không bao giờ 2 trận LIVE một sân", () => {
  const live = makeMatch({ id: "live", code: 1, status: "LIVE", courtId: "c1" });

  it("chặn chuyển trận LIVE vào sân đang bận", () => {
    const other = makeMatch({ id: "other", code: 2, status: "LIVE" });
    const result = canAssignCourt(other, "c1", [live, other]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("đang có trận");
  });

  it("cho xếp hàng chờ với trận chưa bắt đầu (chỉ cảnh báo)", () => {
    const queued = makeMatch({ id: "queued", code: 3, status: "SCHEDULED" });
    const result = canAssignCourt(queued, "c1", [live, queued]);
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toContain("đang bận");
  });

  it("chặn bắt đầu trận trên sân đang có trận LIVE", () => {
    const queued = makeMatch({ id: "queued", code: 3, status: "SCHEDULED", courtId: "c1" });
    const result = canStartMatch(queued, [live, queued]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Sân đang có trận");
  });

  it("chặn một đội đá 2 trận cùng lúc", () => {
    const busy = makeMatch({ id: "busy", code: 4, status: "LIVE", courtId: "c1", team1Id: "x" });
    const next = makeMatch({
      id: "next",
      code: 5,
      status: "SCHEDULED",
      courtId: "c2",
      team1Id: "x",
      team2Id: "y",
    });
    const result = canStartMatch(next, [busy, next]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("đang thi đấu ở trận");
  });

  it("chặn bắt đầu trận thiếu đội", () => {
    const pending = makeMatch({ status: "SCHEDULED", courtId: "c2", team2Id: undefined });
    expect(canStartMatch(pending, []).ok).toBe(false);
  });

  it("cảnh báo khi trận chưa được phân sân", () => {
    const noCourt = makeMatch({ status: "SCHEDULED", courtId: undefined });
    const result = canStartMatch(noCourt, []);
    expect(result.warnings[0]).toContain("chưa được phân sân");
  });
});

describe("canReopenMatch", () => {
  it("chỉ mở lại được trận đã kết thúc", () => {
    expect(canReopenMatch(makeMatch({ status: "LIVE" }), []).ok).toBe(false);
  });

  it("cảnh báo ảnh hưởng nhánh knockout", () => {
    const semi = makeMatch({ stage: "SEMI_FINAL", status: "FINISHED" });
    expect(canReopenMatch(semi, [semi]).warnings[0]).toContain("knockout");
  });

  it("cảnh báo khi sửa vòng bảng lúc knockout đã tạo", () => {
    const group = makeMatch({ status: "FINISHED" });
    const semi = makeMatch({ stage: "SEMI_FINAL" });
    expect(canReopenMatch(group, [group, semi]).warnings[0]).toContain("knockout đã tạo");
  });
});

describe("canGenerateSchedule / canCreateKnockout", () => {
  const teams = ["a", "b", "c", "d"].map((id) => makeTeam(id));
  const groups = [makeGroup("g1", "Bảng A", ["a", "b"], 0), makeGroup("g2", "Bảng B", ["c", "d"], 1)];

  it("cảnh báo mất dữ liệu khi sinh lại lịch đã có kết quả", () => {
    const played = [finishedMatch("a", "b", 11, 3, { groupId: "g1" })];
    const result = canGenerateSchedule(groups, teams, played);
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("XOÁ toàn bộ kết quả");
  });

  it("chặn tạo knockout khi tổng suất không phải luỹ thừa của 2", () => {
    const odd = groups.map((g) => ({ ...g, qualificationSlots: 1 }));
    const finished = [
      finishedMatch("a", "b", 11, 3, { groupId: "g1" }),
      finishedMatch("c", "d", 11, 3, { groupId: "g2" }),
    ];
    const result = canCreateKnockout(tournament, odd, finished);
    expect(result.ok).toBe(true); // 2 suất -> hợp lệ

    const three = groups.map((g) => ({ ...g, qualificationSlots: 3 }));
    expect(canCreateKnockout(tournament, three, finished).ok).toBe(false);
  });
});
