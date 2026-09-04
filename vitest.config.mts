import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Test emulator chạy riêng bằng `npm run test:emulator` (cần Java).
    exclude: ["tests/emulator/**", "node_modules/**"],
  },
});
