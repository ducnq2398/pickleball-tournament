/**
 * Tạo tài khoản ADMIN trong Firebase Emulator để chạy thử app dưới máy mà không
 * cần deploy rules hay đụng dữ liệu giải thật.
 *
 *   npm run emulator            # cửa sổ 1: bật Firestore + Auth emulator
 *   npm run emulator:admin      # cửa sổ 2: tạo tài khoản btc@demo.local / demo1234
 *   npm run dev:emulator        # cửa sổ 2: chạy app trỏ vào emulator
 *
 * Sau đó vào http://localhost:3000/login, đăng nhập rồi bấm TẠO GIẢI MẪU.
 */
const PROJECT = process.env.EMULATOR_PROJECT || "demo-pickleball";
const FIRESTORE = process.env.FIRESTORE_EMULATOR || "127.0.0.1:8080";
const AUTH = process.env.AUTH_EMULATOR || "127.0.0.1:9099";
const EMAIL = process.argv[2] || "btc@demo.local";
const PASSWORD = process.argv[3] || "demo1234";

const authBase = `http://${AUTH}/identitytoolkit.googleapis.com/v1`;

async function jsonFetch(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  try {
    return { ok: res.ok, body: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: res.ok, body: { raw: text } };
  }
}

// 1. Tạo tài khoản (bỏ qua nếu đã có) rồi lấy UID.
let created = await jsonFetch(`${authBase}/accounts:signUp?key=demo-key`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
});

if (!created.ok && created.body?.error?.message === "EMAIL_EXISTS") {
  created = await jsonFetch(`${authBase}/accounts:signInWithPassword?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  });
}

if (!created.ok || !created.body.localId) {
  console.error("❌ Không tạo/đăng nhập được tài khoản trong Auth Emulator.");
  console.error("   Emulator đã chạy chưa? (npm run emulator)");
  console.error("  ", JSON.stringify(created.body).slice(0, 300));
  process.exit(1);
}

const uid = created.body.localId;

// 2. Gán vai trò ADMIN trong Firestore Emulator.
const docUrl =
  `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`;
const written = await jsonFetch(docUrl, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    // Emulator coi "Bearer owner" là quyền admin (giống Admin SDK) nên bỏ qua
    // security rules — cần thiết vì rules cấm mọi người tự phong ADMIN.
    Authorization: "Bearer owner",
  },
  body: JSON.stringify({
    fields: {
      name: { stringValue: "Ban tổ chức (emulator)" },
      email: { stringValue: EMAIL },
      role: { stringValue: "ADMIN" },
    },
  }),
});

if (!written.ok) {
  console.error("❌ Không ghi được users/" + uid, JSON.stringify(written.body).slice(0, 300));
  process.exit(1);
}

console.log("✅ Tài khoản ADMIN cho emulator đã sẵn sàng");
console.log(`   Email:    ${EMAIL}`);
console.log(`   Mật khẩu: ${PASSWORD}`);
console.log(`   UID:      ${uid}`);
console.log("\n   Tiếp theo: npm run dev:emulator  →  http://localhost:3000/login");
