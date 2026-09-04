/**
 * Kiểm tra vai trò của một tài khoản: đăng nhập rồi đọc lại users/{uid}.
 *
 * Dùng để xác nhận đã tạo ADMIN đầu tiên đúng chưa — lỗi hay gặp nhất là
 * Document ID không trùng UID, và lỗi đó im lặng (app chỉ báo "chưa được cấp quyền").
 *
 *   npm run check:role -- <email> <mật-khẩu>
 *
 * Script CHỈ ĐỌC, không ghi gì, và không lưu mật khẩu ở đâu cả.
 */
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, getFirestore } from "firebase/firestore";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Cách dùng: npm run check:role -- <email> <mật-khẩu>");
  process.exit(1);
}

function readEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
  } catch {
    console.error(`Không đọc được ${file}. Hãy tạo .env.local từ .env.example.`);
    process.exit(1);
  }
}

const env = readEnv(".env.local");
const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

console.log(`Project: ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);

let user;
try {
  ({ user } = await signInWithEmailAndPassword(getAuth(app), email, password));
} catch (error) {
  console.error(`\n❌ Đăng nhập thất bại: ${error.code ?? error.message}`);
  console.error("   Kiểm tra Authentication → Sign-in method → Email/Password đã Enable chưa.");
  process.exit(1);
}

console.log(`✅ Đăng nhập OK — UID: ${user.uid}`);

let snapshot;
try {
  snapshot = await getDoc(doc(getFirestore(app), "users", user.uid));
} catch (error) {
  console.error(`\n❌ Không đọc được users/${user.uid}: ${error.code ?? error.message}`);
  console.error("   Nhiều khả năng chưa deploy firestore.rules:");
  console.error("   npx firebase deploy --only firestore:rules,firestore:indexes");
  process.exit(1);
}

if (!snapshot.exists()) {
  console.error(`\n❌ Chưa có document users/${user.uid}`);
  console.error("   Vào Firestore → collection 'users' → tạo document với");
  console.error(`   Document ID ĐÚNG BẰNG: ${user.uid}`);
  console.error("   và field role = ADMIN (kiểu string).");
  process.exit(1);
}

const data = snapshot.data();
console.log(`   Hồ sơ: name="${data.name ?? "?"}" role="${data.role ?? "?"}"`);

if (data.role === "ADMIN") {
  console.log("\n🎉 Tài khoản này là ADMIN — vào được /admin.");
} else if (data.role === "REFEREE") {
  console.log("\n⚠️  Đang là REFEREE. Vào Firestore → users → " + user.uid);
  console.log("   sửa field role thành ADMIN rồi tải lại app.");
} else {
  console.log(`\n⚠️  role không hợp lệ: "${data.role}". Chỉ chấp nhận ADMIN hoặc REFEREE.`);
}

process.exit(0);
