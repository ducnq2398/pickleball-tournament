/**
 * Khởi tạo Firebase cho phía client.
 *
 * Nguyên tắc:
 * - KHÔNG hard-code credential, mọi giá trị lấy từ biến môi trường NEXT_PUBLIC_*.
 * - Khởi tạo LAZY: không chạy gì ở module scope để `next build` / SSR không
 *   nổ khi thiếu env, và để prerender không cần Firebase.
 * - Bật persistent cache (IndexedDB, multi-tab) để trọng tài vẫn thao tác được
 *   khi mạng chập chờn — Firestore SDK tự sync lại khi có mạng.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const;

/** Các biến bắt buộc để SDK hoạt động. */
const REQUIRED_KEYS = ["apiKey", "authDomain", "projectId", "appId"] as const;

/** Danh sách biến môi trường còn thiếu (dùng cho màn hình hướng dẫn setup). */
export function missingFirebaseEnvKeys(): string[] {
  const map: Record<(typeof REQUIRED_KEYS)[number], string> = {
    apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
    authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
  };
  return REQUIRED_KEYS.filter((key) => !firebaseConfig[key]).map((key) => map[key]);
}

export function isFirebaseConfigured(): boolean {
  return missingFirebaseEnvKeys().length === 0;
}

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super(
      `Thiếu cấu hình Firebase: ${missingFirebaseEnvKeys().join(", ")}. ` +
        `Tạo file .env.local dựa trên .env.example rồi khởi động lại dev server.`,
    );
    this.name = "FirebaseNotConfiguredError";
  }
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) throw new FirebaseNotConfiguredError();
  if (appInstance) return appInstance;
  appInstance = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: firebaseConfig.apiKey as string,
        authDomain: firebaseConfig.authDomain as string,
        projectId: firebaseConfig.projectId as string,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
        appId: firebaseConfig.appId as string,
      });
  return appInstance;
}

/**
 * Firestore instance dùng chung. Ở browser bật IndexedDB cache đa tab;
 * ở server (SSR/build) dùng bản mặc định để không đụng tới IndexedDB.
 */
export function getDb(): Firestore {
  if (dbInstance) return dbInstance;
  const app = getFirebaseApp();

  if (typeof window === "undefined") {
    dbInstance = getFirestore(app);
    return dbInstance;
  }

  try {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalForceLongPolling:
        process.env.NEXT_PUBLIC_FIREBASE_FORCE_LONG_POLLING === "true",
    });
  } catch {
    // initializeFirestore ném lỗi nếu instance đã tồn tại (hot reload) -> lấy lại.
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth(getFirebaseApp());
  return authInstance;
}
