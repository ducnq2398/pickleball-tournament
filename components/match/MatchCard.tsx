"use client";

/**
 * Thẻ trận dùng chung cho Admin, lịch thi đấu và trang công khai.
 */
import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import type { Court, Group, Match, Team } from "@/types/tournament";
import { STAGE_LABELS } from "@/lib/tournament/knockout";
import { cn, formatTime } from "@/lib/utils";
import { MatchStatusBadge } from "@/components/ui/Badge";
import { TeamName } from "./TeamName";

export function MatchCard({
  match,
  teams,
  groups,
  courts,
  actions,
  compact = false,
  className,
}: {
  match: Match;
  teams: Team[];
  groups: Group[];
  courts: Court[];
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const group = groups.find((g) => g.id === match.groupId);
  const court = courts.find((c) => c.id === match.courtId);
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";

  const rows: { teamId?: string; slot: 1 | 2; score: number }[] = [
    { teamId: match.team1Id, slot: 1, score: match.score1 },
    { teamId: match.team2Id, slot: 2, score: match.score2 },
  ];

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface px-3 py-3 transition-colors sm:px-4",
        isLive ? "border-live-500/50 bg-live-500/5" : "border-line/70",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
        <span className="font-semibold text-body">#{match.code}</span>
        <span>·</span>
        <span>{match.stage === "GROUP" ? (group?.name ?? "Vòng bảng") : STAGE_LABELS[match.stage]}</span>
        {court ? (
          <>
            <span>·</span>
            <span className="font-medium text-info-400">{court.name}</span>
          </>
        ) : null}
        {isFinished && match.finishedAt ? (
          <>
            <span>·</span>
            <span>{formatTime(new Date(match.finishedAt).toISOString())}</span>
          </>
        ) : null}
        <MatchStatusBadge status={match.status} className="ml-auto" />
      </div>

      <div className="space-y-1">
        {rows.map((row) => {
          const isWinner = isFinished && match.winnerId === row.teamId;
          return (
            <div
              key={row.slot}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg px-2 py-1.5",
                isWinner && "bg-brand-500/10",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {isWinner ? <Trophy className="h-4 w-4 shrink-0 text-brand-400" /> : null}
                <TeamName
                  teamId={row.teamId}
                  match={match}
                  slot={row.slot}
                  teams={teams}
                  showPlayers={!compact}
                  className="min-w-0 flex-1 text-sm"
                />
              </div>
              <span
                className={cn(
                  "tabular w-10 shrink-0 text-right text-xl font-bold",
                  isLive ? "text-live-400" : isWinner ? "text-brand-400" : "text-body",
                  match.status === "SCHEDULED" && "text-faint",
                )}
              >
                {row.score}
              </span>
            </div>
          );
        })}
      </div>

      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
