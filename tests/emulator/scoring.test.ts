/**
 * TEST TÍCH HỢP trên Firestore Emulator: chạy ĐÚNG các hàm repository mà app
 * dùng ngoài đời, để chứng minh những lời hứa quan trọng nhất:
 *
 * - Nhiều thiết bị bấm +1 cùng lúc: KHÔNG mất điểm, KHÔNG ghi đè nhau.
 * - Không bao giờ có 2 trận LIVE trên cùng một sân.
 * - Không cộng được điểm sau khi trận đã kết thúc.
 * - Sửa kết quả knockout thì nhánh sau được đặt lại và ghép đội mới.
 *
 * Chạy: npm run test:emulator
 */
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { connectFirestoreEmulator, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Court, Group, Match, Team, Tournament } from "@/types/tournament";
import { getDb } from "@/lib/firebase";
import { matchDoc, matchesCol, tournamentDoc, courtsCol, groupsCol, teamsCol } from "@/lib/firestore/paths";
import { parseCourt, parseGroup, parseMatch, parseTeam, parseTournament } from "@/lib/firestore/converters";
import { createTournamentWithData } from "@/lib/firestore/bootstrap";
import {
  adjustScore,
  assignCourt,
  editFinishedScore,
  finishMatch,
  reopenMatch,
  setScore,
  startMatch,
} from "@/lib/firestore/matches";
import { createKnockout, refreshBracketAfterResult, syncKnockout } from "@/lib/firestore/knockout";
import { createTournamentConfig } from "@/lib/tournament/tournament";
import { calculateAllStandings } from "@/lib/tournament/standings";

let testEnv: RulesTestEnvironment;
let tournamentId: string;

/* ------------------------------- tiện ích -------------------------------- */

async function loadMatches(): Promise<Match[]> {
  const snapshot = await getDocs(matchesCol(tournamentId));
  return snapshot.docs
    .map((d) => parseMatch(d.id, d.data()))
    .sort((a, b) => a.order - b.order);
}

async function loadMatch(id: string): Promise<Match> {
  const snapshot = await getDoc(matchDoc(tournamentId, id));
  return parseMatch(snapshot.id, snapshot.data() ?? {});
}

async function loadTournament(): Promise<Tournament> {
  const snapshot = await getDoc(tournamentDoc(tournamentId));
  return parseTournament(snapshot.id, snapshot.data() ?? {});
}

async function loadTeams(): Promise<Team[]> {
  const snapshot = await getDocs(teamsCol(tournamentId));
  return snapshot.docs.map((d) => parseTeam(d.id, d.data()));
}

async function loadGroups(): Promise<Group[]> {
  const snapshot = await getDocs(groupsCol(tournamentId));
  return snapshot.docs.map((d) => parseGroup(d.id, d.data())).sort((a, b) => a.order - b.order);
}

async function loadCourts(): Promise<Court[]> {
  const snapshot = await getDocs(courtsCol(tournamentId));
  return snapshot.docs.map((d) => parseCourt(d.id, d.data())).sort((a, b) => a.number - b.number);
}

/** Đá xong một trận với tỷ số cho trước (không cần bắt đầu, dùng cho test nhanh). */
async function playTo(match: Match, score1: number, score2: number): Promise<Match> {
  await setScore(tournamentId, match.id, score1, score2);
  const updated = await loadMatch(match.id);
  return finishMatch(tournamentId, updated);
}

const TEAM_NAMES = Array.from({ length: 9 }, (_, index) => `Đội ${index + 1}`);

async function createTournament(): Promise<string> {
  const result = await createTournamentWithData({
    name: "Giải test emulator",
    config: createTournamentConfig(),
    teams: TEAM_NAMES.map((name, index) => ({
      name,
      playerNames: [`${name} - A`, `${name} - B`],
      note: String(index),
    })),
    generateSchedule: true,
    startImmediately: true,
  });
  return result.tournamentId;
}

beforeAll(async () => {
  // Rules mở cho project logic — phần rules đã có bộ test riêng (rules.test.ts).
  testEnv = await initializeTestEnvironment({
    projectId: "demo-logic",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: `rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /{document=**} { allow read, write: if true; }
  }
}`,
    },
  });
  connectFirestoreEmulator(getDb(), "127.0.0.1", 8080);
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  tournamentId = await createTournament();
});

/* --------------------------------- tests --------------------------------- */

describe("Khởi tạo giải trên Firestore", () => {
  it("tạo đúng 9 đội, 2 bảng (5+4), 2 sân và 16 trận vòng bảng", async () => {
    const [teams, groups, courts, matches] = await Promise.all([
      loadTeams(),
      loadGroups(),
      loadCourts(),
      loadMatches(),
    ]);

    expect(teams).toHaveLength(9);
    expect(groups).toHaveLength(2);
    expect(groups[0].teamIds).toHaveLength(5);
    expect(groups[1].teamIds).toHaveLength(4);
    expect(courts).toHaveLength(2);
    expect(matches).toHaveLength(16);
    expect(matches.every((m) => m.status === "SCHEDULED")).toBe(true);
    expect(matches.every((m) => m.targetScore === 11 && m.winByTwo)).toBe(true);
    expect((await loadTournament()).status).toBe("GROUP_STAGE");

    // teamIds trong group phải khớp groupId trên team (không lệch nguồn dữ liệu).
    for (const group of groups) {
      for (const teamId of group.teamIds) {
        expect(teams.find((t) => t.id === teamId)?.groupId).toBe(group.id);
      }
    }
  });
});

describe("Cộng điểm đồng thời — không được mất hay ghi đè điểm", () => {
  /** Trận riêng với điểm chạm cao để cộng nhiều lần vẫn hợp lệ. */
  async function createLongMatch(score1 = 0, score2 = 0): Promise<Match> {
    const id = "long-match";
    await setDoc(matchDoc(tournamentId, id), {
      code: 99,
      stage: "GROUP",
      groupId: "group-a",
      team1Id: "x",
      team2Id: "y",
      score1,
      score2,
      targetScore: 50,
      winByTwo: true,
      status: "LIVE",
      order: 999,
    });
    return loadMatch(id);
  }

  it("20 lần bấm +1 cùng lúc cho ra đúng 20 điểm", async () => {
    const match = await createLongMatch();

    await Promise.all(
      Array.from({ length: 20 }, () => adjustScore(tournamentId, match, 1, 1)),
    );

    const updated = await loadMatch(match.id);
    expect(updated.score1).toBe(20);
    expect(updated.score2).toBe(0);
  });

  it("hai trọng tài bấm cho hai đội cùng lúc: cả hai điểm đều được ghi", async () => {
    const match = await createLongMatch();

    await Promise.all([
      ...Array.from({ length: 12 }, () => adjustScore(tournamentId, match, 1, 1)),
      ...Array.from({ length: 9 }, () => adjustScore(tournamentId, match, 2, 1)),
    ]);

    const updated = await loadMatch(match.id);
    expect(updated.score1).toBe(12);
    expect(updated.score2).toBe(9);
  });

  it("cộng rồi trừ đan xen vẫn ra kết quả đúng", async () => {
    // Bắt đầu từ 10 điểm: dù các thao tác chạy theo thứ tự nào, điểm cũng không
    // thể tụt xuống dưới 0 nên mọi lệnh đều hợp lệ.
    const match = await createLongMatch(10);

    await Promise.all([
      ...Array.from({ length: 10 }, () => adjustScore(tournamentId, match, 1, 1)),
      ...Array.from({ length: 4 }, () => adjustScore(tournamentId, match, 1, -1)),
    ]);

    const updated = await loadMatch(match.id);
    expect(updated.score1).toBe(16);
  });

  it("không cho trừ điểm xuống dưới 0 dù bấm dồn dập", async () => {
    const match = await createLongMatch(1);

    const results = await Promise.allSettled([
      adjustScore(tournamentId, match, 1, -1),
      adjustScore(tournamentId, match, 1, -1),
      adjustScore(tournamentId, match, 1, -1),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await loadMatch(match.id)).score1).toBe(0);
  });
});

describe("Khoá sân — không bao giờ 2 trận LIVE cùng một sân", () => {
  it("chỉ một trận vào được sân khi hai người bấm bắt đầu cùng lúc", async () => {
    const matches = await loadMatches();
    const court = (await loadCourts())[0];
    const candidates = matches.filter((m) => m.courtId === court.id).slice(0, 2);
    expect(candidates).toHaveLength(2);

    const results = await Promise.allSettled([
      startMatch(tournamentId, candidates[0], matches),
      startMatch(tournamentId, candidates[1], matches),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const after = await loadMatches();
    const liveOnCourt = after.filter((m) => m.courtId === court.id && m.status === "LIVE");
    expect(liveOnCourt).toHaveLength(1);

    const courtAfter = (await loadCourts()).find((c) => c.id === court.id);
    expect(courtAfter?.currentMatchId).toBe(liveOnCourt[0].id);
    expect(courtAfter?.status).toBe("IN_USE");
  });

  it("kết thúc trận thì sân được trả lại tự động", async () => {
    const matches = await loadMatches();
    const match = matches[0];
    await startMatch(tournamentId, match, matches);
    await setScore(tournamentId, match.id, 11, 4);
    const finished = await finishMatch(tournamentId, await loadMatch(match.id));

    expect(finished.winnerId).toBe(match.team1Id);
    expect(finished.loserId).toBe(match.team2Id);

    const court = (await loadCourts()).find((c) => c.id === match.courtId);
    expect(court?.currentMatchId).toBeUndefined();
    expect(court?.status).toBe("AVAILABLE");
  });

  it("chuyển sân cho trận đang LIVE sẽ dời cả khoá sân", async () => {
    const matches = await loadMatches();
    const courts = await loadCourts();
    const match = matches.find((m) => m.courtId === courts[0].id) as Match;

    await startMatch(tournamentId, match, matches);
    await assignCourt(tournamentId, await loadMatch(match.id), courts[1].id, await loadMatches());

    const after = await loadCourts();
    expect(after.find((c) => c.id === courts[0].id)?.currentMatchId).toBeUndefined();
    expect(after.find((c) => c.id === courts[1].id)?.currentMatchId).toBe(match.id);
  });
});

describe("Luật điểm được ép ở tầng ghi dữ liệu", () => {
  it("không cộng được điểm khi trận đã kết thúc", async () => {
    const matches = await loadMatches();
    const finished = await playTo(matches[0], 11, 6);

    await expect(adjustScore(tournamentId, finished, 1, 1)).rejects.toThrow(/đã kết thúc/i);
    expect((await loadMatch(finished.id)).score1).toBe(11);
  });

  it("không kết thúc được trận khi tỷ số chưa đủ điều kiện (deuce)", async () => {
    const matches = await loadMatches();
    await setScore(tournamentId, matches[1].id, 11, 10);
    const match = await loadMatch(matches[1].id);
    await expect(finishMatch(tournamentId, match)).rejects.toThrow(/Deuce|cách biệt/i);
  });

  it("không ghi được tỷ số vô lý", async () => {
    const matches = await loadMatches();
    await expect(setScore(tournamentId, matches[2].id, 14, 8)).rejects.toThrow(/không hợp lệ/i);
    await expect(setScore(tournamentId, matches[2].id, -1, 5)).rejects.toThrow(/không âm/i);
  });

  it("mở lại trận rồi sửa điểm thì thắng/thua được tính lại", async () => {
    const matches = await loadMatches();
    const finished = await playTo(matches[3], 11, 5);
    expect(finished.winnerId).toBe(matches[3].team1Id);

    const updated = await editFinishedScore(tournamentId, finished.id, 7, 11);
    expect(updated.winnerId).toBe(matches[3].team2Id);
    expect((await loadMatch(finished.id)).winnerId).toBe(matches[3].team2Id);

    const reopened = await reopenMatch(tournamentId, finished.id);
    expect(reopened.status).toBe("FINISHED"); // trả về bản TRƯỚC khi mở
    const now = await loadMatch(finished.id);
    expect(now.status).toBe("LIVE");
    expect(now.winnerId).toBeUndefined();
  });
});

describe("Vòng bảng → knockout → nhà vô địch", () => {
  it("chạy trọn kịch bản và tự điền đội cho từng vòng", async () => {
    // Đá hết 16 trận: đội có số thứ tự nhỏ hơn luôn thắng.
    const teams = await loadTeams();
    const rank = (teamId?: string) => Number(teams.find((t) => t.id === teamId)?.note ?? 99);

    for (const match of await loadMatches()) {
      const team1Stronger = rank(match.team1Id) < rank(match.team2Id);
      await playTo(match, team1Stronger ? 11 : 5, team1Stronger ? 5 : 11);
    }

    const groups = await loadGroups();
    let matches = await loadMatches();
    expect(matches.filter((m) => m.status === "FINISHED")).toHaveLength(16);

    // Tạo knockout
    const tournament = await loadTournament();
    const courts = await loadCourts();
    const created = await createKnockout(tournament, groups, teams, courts, matches);
    expect(created).toBe(3);

    matches = await loadMatches();
    const semis = matches.filter((m) => m.stage === "SEMI_FINAL");
    const final = matches.find((m) => m.stage === "FINAL") as Match;
    expect(semis).toHaveLength(2);
    expect((await loadTournament()).status).toBe("KNOCKOUT");

    // Bán kết đã được điền đội theo BXH: Nhất A - Nhì B và Nhất B - Nhì A
    const standings = calculateAllStandings(groups, teams, matches);
    const at = (groupIndex: number, position: number) =>
      standings.get(groups[groupIndex].id)?.find((row) => row.rank === position)?.teamId;

    expect(semis[0].team1Id).toBe(at(0, 1));
    expect(semis[0].team2Id).toBe(at(1, 2));
    expect(semis[1].team1Id).toBe(at(1, 1));
    expect(semis[1].team2Id).toBe(at(0, 2));
    expect(final.team1Id).toBeUndefined();
    expect(semis.every((m) => m.targetScore === 15)).toBe(true);

    // Đá 2 bán kết -> chung kết tự có đội
    for (const semi of semis) {
      const stronger = rank(semi.team1Id) < rank(semi.team2Id);
      await playTo(semi, stronger ? 15 : 9, stronger ? 9 : 15);
    }

    matches = await loadMatches();
    await syncKnockout(await loadTournament(), groups, teams, matches);

    const finalAfterSemis = await loadMatch(final.id);
    const semiWinners = matches
      .filter((m) => m.stage === "SEMI_FINAL")
      .map((m) => m.winnerId);
    expect(finalAfterSemis.team1Id).toBe(semiWinners[0]);
    expect(finalAfterSemis.team2Id).toBe(semiWinners[1]);

    // Đá chung kết -> có nhà vô địch, giải chuyển sang FINISHED
    const played = await playTo(finalAfterSemis, 15, 11);
    matches = await loadMatches();
    await syncKnockout(await loadTournament(), groups, teams, matches);

    const done = await loadTournament();
    expect(done.status).toBe("FINISHED");
    expect(done.championTeamId).toBe(played.winnerId);
    expect(played.winnerId).toBe(finalAfterSemis.team1Id);
  });

  it("sửa kết quả bán kết sẽ đặt lại chung kết và ghép đội mới", async () => {
    const teams = await loadTeams();
    const rank = (teamId?: string) => Number(teams.find((t) => t.id === teamId)?.note ?? 99);

    for (const match of await loadMatches()) {
      const team1Stronger = rank(match.team1Id) < rank(match.team2Id);
      await playTo(match, team1Stronger ? 11 : 5, team1Stronger ? 5 : 11);
    }

    const groups = await loadGroups();
    const courts = await loadCourts();
    await createKnockout(await loadTournament(), groups, teams, courts, await loadMatches());

    let matches = await loadMatches();
    const semis = matches.filter((m) => m.stage === "SEMI_FINAL");
    const final = matches.find((m) => m.stage === "FINAL") as Match;

    for (const semi of semis) {
      await playTo(semi, 15, 9); // đội 1 thắng cả hai
    }
    matches = await loadMatches();
    await syncKnockout(await loadTournament(), groups, teams, matches);

    const beforeEdit = await loadMatch(final.id);
    expect(beforeEdit.team1Id).toBe(semis[0].team1Id);

    // Sửa bán kết 1: đội 2 mới là đội thắng
    const updatedSemi = await editFinishedScore(tournamentId, semis[0].id, 9, 15);
    expect(updatedSemi.winnerId).toBe(semis[0].team2Id);

    matches = (await loadMatches()).map((m) => (m.id === updatedSemi.id ? updatedSemi : m));
    await refreshBracketAfterResult(
      await loadTournament(),
      groups,
      teams,
      matches,
      updatedSemi.id,
      { resetDependents: true },
    );

    const afterEdit = await loadMatch(final.id);
    expect(afterEdit.team1Id).toBe(semis[0].team2Id);
    expect(afterEdit.status).toBe("SCHEDULED");
    expect(afterEdit.score1).toBe(0);
    expect(afterEdit.winnerId).toBeUndefined();
  });
});
