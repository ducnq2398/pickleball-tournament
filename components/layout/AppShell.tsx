"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AppHeader } from "./AppHeader";

export function AppShell({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main
        className={cn(
          "mx-auto w-full flex-1 px-4 py-5 sm:py-6",
          wide ? "max-w-[1600px]" : "max-w-7xl",
          className,
        )}
      >
        {children}
      </main>
      <footer className="border-t border-line/60 px-4 py-4 text-center text-xs text-faint">
        Hệ thống điều hành giải Pickleball · dữ liệu realtime qua Firebase Firestore
      </footer>
    </div>
  );
}
