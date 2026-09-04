"use client";

/**
 * Sơ đồ nhánh knockout.
 * Desktop: mỗi vòng là một cột, đọc từ trái sang phải.
 * Mobile: các vòng xếp dọc thành thẻ (§26).
 */
import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import type { Court, Match, Stage, Team } from "@/types/tournament";
import { STAGE_LABELS, sourceLabel } from "@/lib/tournament/knockout";
import { cn } from "@/lib/utils";
import { MatchStatusBadge } from "@/components/ui/Badge";

export function BracketView({
  rounds,
  teams,
  courts,
  renderActions,
}: {
  rounds: { stage: Stage; matches: Match[] }[];
  teams: Team[];
  courts: Court[];
  renderActions?: (match: Match) => ReactNode;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex min-w-full flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
        {rounds.map((round) => (
          <div key={round.stage} className="flex min-w-[17rem] flex-1 flex-col">
            <h3 className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-mute">
              {STAGE_LABELS[round.stage]}
            </h3>
            <div className="flex flex-1 flex-col justify-around gap-4">
              {round.matches.map((match) => (
                <BracketMatch
                  key={match.id}
                  match={match}
                  teams={teams}
                  courts={courts}
                  actions={renderActions?.(match)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketMatch({
  match,
  teams,
  courts,
  actions,
}: {
  match: Match;
  teams: Team[];
  courts: Court[];
  actions?: ReactNode;
}) {
  const court = courts.find((c) => c.id === match.courtId);
  const slots = [
    { teamId: match.team1Id, score: match.score1, source: match.team1Source },
    { teamId: match.team2Id, score: match.score2, source: match.team2Source },
  ];

  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface p-3",
        match.status === "LIVE" ? "border-live-500/60" : "border-line",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-mute">
        <span className="font-semibold text-body">
          #{match.code}
          {court ? ` · ${court.name}` : ""}
        </span>
        <MatchStatusBadge status={match.status} />
      </div>

      <div className="space-y-1">
        {slots.map((slot, index) => {
          const team = slot.teamId ? teams.find((t) => t.id === slot.teamId) : undefined;
          const isWinner = match.status === "FINISHED" && match.winnerId === slot.teamId;
          return (
            <div
              key={index}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2",
                isWinner ? "bg-brand-500/15" : "bg-subtle/60",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {isWinner ? <Trophy className="h-3.5 w-3.5 shrink-0 text-brand-400" /> : null}
                <span
                  className={cn(
                    "truncate text-sm",
                    team
                      ? isWinner
                        ? "font-bold text-brand-400"
                        : "font-semibold text-strong"
                      : "italic text-mute",
                  )}
                >
                  {team?.name ?? sourceLabel(slot.source)}
                </span>
              </span>
              <span
                className={cn(
                  "tabular shrink-0 text-lg font-bold",
                  match.status === "SCHEDULED"
                    ? "text-faint"
                    : isWinner
                      ? "text-brand-400"
                      : "text-body",
                )}
              >
                {slot.score}
              </span>
            </div>
          );
        })}
      </div>

      {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
