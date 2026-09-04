"use client";

/**
 * Thanh điều hướng chung cho các trang công khai + lối vào Admin/Trọng tài.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ClipboardList,
  LayoutDashboard,
  ListOrdered,
  Menu,
  Monitor,
  Trophy,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { TournamentSwitcher } from "@/components/tournament/TournamentSwitcher";

const LINKS = [
  { href: "/scoreboard", label: "Bảng điểm", icon: Monitor },
  { href: "/standings", label: "Xếp hạng", icon: ListOrdered },
  { href: "/knockout", label: "Knockout", icon: Trophy },
  { href: "/referee", label: "Trọng tài", icon: ClipboardList },
  { href: "/admin", label: "Quản trị", icon: LayoutDashboard },
];

export function AppHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/70 bg-ink-900/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-ink-950">
            <Trophy className="h-4.5 w-4.5" />
          </span>
          <span className="hidden text-sm font-bold tracking-tight text-ink-100 sm:block">
            PICKLEBALL
          </span>
        </Link>

        <nav className="ml-2 hidden flex-1 items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(link.href)
                  ? "bg-ink-800 text-ink-100"
                  : "text-ink-400 hover:bg-ink-800/60 hover:text-ink-200",
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <TournamentSwitcher className="hidden sm:block" />
          <ConnectionIndicator />
          <button
            type="button"
            className="rounded-lg p-2 text-ink-300 hover:bg-ink-800 md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-ink-700/70 bg-ink-900 px-4 py-3 md:hidden">
          <TournamentSwitcher className="mb-3 sm:hidden" />
          <div className="grid grid-cols-2 gap-2">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                  isActive(link.href) ? "bg-ink-800 text-ink-100" : "bg-ink-850 text-ink-300",
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
