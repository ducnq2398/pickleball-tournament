"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LayoutDashboard, ListChecks, Settings, Users, Wand2, Rows3 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/layout/AuthGate";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { useTournament } from "@/hooks/useTournament";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { href: "/admin/teams", label: "Đội", icon: Users },
  { href: "/admin/groups", label: "Bảng đấu", icon: Rows3 },
  { href: "/admin/matches", label: "Trận đấu", icon: ListChecks },
  { href: "/admin/settings", label: "Cài đặt", icon: Settings },
  { href: "/admin/setup", label: "Tạo giải", icon: Wand2 },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { configured } = useTournament();

  if (!configured) {
    return (
      <AppShell>
        <SetupNotice />
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <AuthGate require="ADMIN">
        <div className="space-y-5">
          <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-1 rounded-xl border border-ink-700/70 bg-ink-850 p-1">
              {TABS.map((tab) => {
                const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-500 text-ink-950"
                        : "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </nav>
          {children}
        </div>
      </AuthGate>
    </AppShell>
  );
}
