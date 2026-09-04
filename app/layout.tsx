import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: {
    default: "Giải Pickleball · Điều hành & Bảng điểm realtime",
    template: "%s · Pickleball",
  },
  description:
    "Hệ thống quản lý và điều hành giải Pickleball: lịch thi đấu, nhập điểm realtime, bảng xếp hạng và nhánh knockout.",
  manifest: "/manifest.webmanifest",
  applicationName: "Pickleball Tournament",
  appleWebApp: {
    capable: true,
    title: "Pickleball",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-ink-900 text-ink-100 antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
