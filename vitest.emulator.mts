import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Cấu hình test chạy trên Firestore Emulator (cần Java).
 * Dùng: npm run test:emulator
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["tests/emulator/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    env: {
      // Project demo dùng riêng cho test logic (rules mở, xem setup.ts).
      NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-logic.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-logic",
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:demo",
    },
  },
});
