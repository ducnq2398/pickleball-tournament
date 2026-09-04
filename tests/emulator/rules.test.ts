/**
 * KIỂM TRA FIRESTORE SECURITY RULES trên emulator thật.
 *
 * Chạy: npm run test:emulator (cần Java + Firestore Emulator).
 * Mục tiêu: chứng minh đúng những gì README hứa —
 * khán giả chỉ đọc, trọng tài chỉ đổi điểm, admin toàn quyền.
 */
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let testEnv: RulesTestEnvironment;

const TOURNAMENT = "t1";
const MATCH = "m1";
const COURT = "court-1";

const matchPath = `tournaments/${TOURNAMENT}/matches/${MATCH}`;
const courtPath = `tournaments/${TOURNAMENT}/courts/${COURT}`;
const teamPath = `tournaments/${TOURNAMENT}/teams/team-1`;

const baseMatch = {
  code: 1,
  stage: "GROUP",
  groupId: "group-a",
  team1Id: "team-1",
  team2Id: "team-2",
  score1: 0,
  score2: 0,
  targetScore: 11,
  winByTwo: true,
  status: "SCHEDULED",
  order: 0,
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-rules",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/admin-uid"), { name: "BTC", role: "ADMIN" });
    await setDoc(doc(db, "users/ref-uid"), { name: "Trọng tài", role: "REFEREE" });
    await setDoc(doc(db, `tournaments/${TOURNAMENT}`), { name: "Giải test", status: "GROUP_STAGE" });
    await setDoc(doc(db, matchPath), baseMatch);
    await setDoc(doc(db, courtPath), { name: "Sân 1", number: 1, status: "AVAILABLE" });
    await setDoc(doc(db, teamPath), { name: "Đội 1", players: [] });
  });
});

const guest = () => testEnv.unauthenticatedContext().firestore();
const referee = () => testEnv.authenticatedContext("ref-uid").firestore();
const admin = () => testEnv.authenticatedContext("admin-uid").firestore();
/** Đã đăng nhập nhưng chưa được cấp vai trò. */
const stranger = () => testEnv.authenticatedContext("nobody-uid").firestore();

describe("PUBLIC (không đăng nhập)", () => {
  it("đọc được giải, trận, đội, sân — để mở scoreboard trên TV", async () => {
    await assertSucceeds(getDoc(doc(guest(), `tournaments/${TOURNAMENT}`)));
    await assertSucceeds(getDoc(doc(guest(), matchPath)));
    await assertSucceeds(getDoc(doc(guest(), teamPath)));
    await assertSucceeds(getDoc(doc(guest(), courtPath)));
  });

  it("KHÔNG ghi được bất cứ thứ gì", async () => {
    await assertFails(updateDoc(doc(guest(), matchPath), { score1: 5 }));
    await assertFails(setDoc(doc(guest(), teamPath), { name: "Hack" }));
    await assertFails(deleteDoc(doc(guest(), matchPath)));
    await assertFails(setDoc(doc(guest(), `tournaments/${TOURNAMENT}`), { name: "Hack" }));
  });

  it("không đọc được nhật ký thao tác", async () => {
    await assertFails(getDoc(doc(guest(), `tournaments/${TOURNAMENT}/auditLogs/x`)));
  });
});

describe("Tài khoản chưa được cấp vai trò", () => {
  it("chỉ được tạo hồ sơ REFEREE cho chính mình", async () => {
    await assertSucceeds(
      setDoc(doc(stranger(), "users/nobody-uid"), { name: "Ai đó", role: "REFEREE" }),
    );
  });

  it("KHÔNG được tự phong ADMIN", async () => {
    await assertFails(
      setDoc(doc(stranger(), "users/nobody-uid"), { name: "Ai đó", role: "ADMIN" }),
    );
  });

  it("KHÔNG được tạo hồ sơ cho người khác", async () => {
    await assertFails(
      setDoc(doc(stranger(), "users/someone-else"), { name: "X", role: "REFEREE" }),
    );
  });

  it("KHÔNG được sửa điểm", async () => {
    await assertFails(updateDoc(doc(stranger(), matchPath), { score1: 1 }));
  });
});

describe("REFEREE", () => {
  it("cập nhật được điểm và trạng thái trận", async () => {
    await assertSucceeds(
      updateDoc(doc(referee(), matchPath), { status: "LIVE", score1: 0, score2: 0 }),
    );
    await assertSucceeds(updateDoc(doc(referee(), matchPath), { score1: 5, score2: 3 }));
  });

  it("kết thúc được trận và trả sân", async () => {
    await assertSucceeds(
      updateDoc(doc(referee(), matchPath), {
        status: "FINISHED",
        score1: 11,
        score2: 5,
        winnerId: "team-1",
        loserId: "team-2",
      }),
    );
    await assertSucceeds(
      updateDoc(doc(referee(), courtPath), { currentMatchId: null, status: "AVAILABLE" }),
    );
  });

  it("KHÔNG mở lại được trận đã kết thúc (đặc quyền của admin)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), matchPath), {
        status: "FINISHED",
        winnerId: "team-1",
      });
    });
    await assertFails(updateDoc(doc(referee(), matchPath), { status: "LIVE" }));
  });

  it("KHÔNG đổi được thể thức trận (điểm chạm, vòng đấu, số hiệu)", async () => {
    await assertFails(updateDoc(doc(referee(), matchPath), { targetScore: 21 }));
    await assertFails(updateDoc(doc(referee(), matchPath), { stage: "FINAL" }));
    await assertFails(updateDoc(doc(referee(), matchPath), { code: 99 }));
  });

  it("KHÔNG ghi được điểm âm hoặc điểm vô lý", async () => {
    await assertFails(updateDoc(doc(referee(), matchPath), { score1: -1 }));
    await assertFails(updateDoc(doc(referee(), matchPath), { score1: 999 }));
    await assertFails(updateDoc(doc(referee(), matchPath), { score1: "11" }));
  });

  it("KHÔNG tạo/xoá được trận", async () => {
    await assertFails(
      setDoc(doc(referee(), `tournaments/${TOURNAMENT}/matches/new-match`), baseMatch),
    );
    await assertFails(deleteDoc(doc(referee(), matchPath)));
  });

  it("KHÔNG sửa được đội, bảng hay cấu hình giải", async () => {
    await assertFails(updateDoc(doc(referee(), teamPath), { name: "Đổi tên" }));
    await assertFails(
      setDoc(doc(referee(), `tournaments/${TOURNAMENT}/groups/group-a`), { name: "X" }),
    );
    await assertFails(updateDoc(doc(referee(), `tournaments/${TOURNAMENT}`), { name: "X" }));
  });

  it("KHÔNG tự phong mình làm ADMIN", async () => {
    await assertFails(updateDoc(doc(referee(), "users/ref-uid"), { role: "ADMIN" }));
  });

  it("ghi được nhật ký nhưng không đọc được", async () => {
    await assertSucceeds(
      setDoc(doc(referee(), `tournaments/${TOURNAMENT}/auditLogs/log-1`), {
        action: "UPDATE_SCORE",
        userId: "ref-uid",
      }),
    );
    await assertFails(getDoc(doc(referee(), `tournaments/${TOURNAMENT}/auditLogs/log-1`)));
  });
});

describe("ADMIN", () => {
  it("toàn quyền với trận, đội, bảng, giải", async () => {
    await assertSucceeds(updateDoc(doc(admin(), matchPath), { score1: 7 }));
    await assertSucceeds(
      setDoc(doc(admin(), `tournaments/${TOURNAMENT}/matches/new-match`), baseMatch),
    );
    await assertSucceeds(deleteDoc(doc(admin(), `tournaments/${TOURNAMENT}/matches/new-match`)));
    await assertSucceeds(updateDoc(doc(admin(), teamPath), { name: "Đội mới" }));
    await assertSucceeds(updateDoc(doc(admin(), `tournaments/${TOURNAMENT}`), { name: "Giải mới" }));
  });

  it("mở lại được trận đã kết thúc", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), matchPath), { status: "FINISHED" });
    });
    await assertSucceeds(updateDoc(doc(admin(), matchPath), { status: "LIVE" }));
  });

  it("đọc được nhật ký và đổi được vai trò người khác", async () => {
    await assertSucceeds(getDoc(doc(admin(), `tournaments/${TOURNAMENT}/auditLogs/any`)));
    await assertSucceeds(updateDoc(doc(admin(), "users/ref-uid"), { role: "ADMIN" }));
  });
});
