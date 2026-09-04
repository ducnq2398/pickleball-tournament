import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  as: Component = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Component
      className={cn(
        "rounded-2xl border border-ink-700/70 bg-ink-850 shadow-sm shadow-black/20",
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-ink-700/60 px-4 py-3 sm:px-5",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="mt-0.5 text-brand-400">{icon}</div> : null}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink-100">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-400">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "live" | "success" | "warning";
}) {
  const tones = {
    default: "text-ink-100",
    live: "text-live-400",
    success: "text-brand-400",
    warning: "text-warn-400",
  } as const;

  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-800/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-bold", tones[tone])}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}
