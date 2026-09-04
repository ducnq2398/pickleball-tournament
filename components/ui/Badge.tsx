import type { ReactNode } from "react";
import type { MatchStatus, TournamentStatus } from "@/types/tournament";
import { MATCH_STATUS_LABELS, TOURNAMENT_STATUS_LABELS } from "@/lib/tournament/tournament";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "live" | "success" | "warning" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-line-strong bg-subtle text-body",
  live: "border-live-500/50 bg-live-500/15 text-live-400",
  success: "border-brand-500/50 bg-brand-500/15 text-brand-400",
  warning: "border-warn-500/50 bg-warn-500/15 text-warn-400",
  info: "border-info-500/50 bg-info-500/15 text-info-400",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("live-dot inline-block h-2 w-2 rounded-full bg-live-500", className)} />
  );
}

const MATCH_TONES: Record<MatchStatus, Tone> = {
  SCHEDULED: "neutral",
  LIVE: "live",
  FINISHED: "success",
  CANCELLED: "warning",
};

export function MatchStatusBadge({ status, className }: { status: MatchStatus; className?: string }) {
  return (
    <Badge tone={MATCH_TONES[status]} className={className}>
      {status === "LIVE" ? <LiveDot /> : null}
      {MATCH_STATUS_LABELS[status]}
    </Badge>
  );
}

const TOURNAMENT_TONES: Record<TournamentStatus, Tone> = {
  DRAFT: "neutral",
  GROUP_STAGE: "info",
  KNOCKOUT: "warning",
  FINISHED: "success",
};

export function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  return <Badge tone={TOURNAMENT_TONES[status]}>{TOURNAMENT_STATUS_LABELS[status]}</Badge>;
}
