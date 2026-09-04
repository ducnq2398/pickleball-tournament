import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Cho phép build ra thư mục khác .next để chạy song song một bản thứ hai
   * (ví dụ bản preview trỏ vào Firestore Emulator) mà không đụng dev server
   * đang mở. Mặc định vẫn là ".next".
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
