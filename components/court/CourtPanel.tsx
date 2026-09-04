"use client";

/**
 * Panel một sân cho màn hình lớn (TV). Ưu tiên: số điểm to nhất có thể,
 * tên đội rõ ràng, trạng thái LIVE nổi bật.
 */
import type { Court, Group, Match, Team } from "@/types/tournament";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/tournament/knockout";
import { Badge, LiveDot } from "@/components/ui/Badge";

export function CourtPanel({
  court,
  match,
  teams,
  groups,
  className,
}: {
  court: Court;
  match?: Match;
  teams: Team[];
  groups: Group[];
  className?: string;
}) {
  const group = groups.find((g) => g.id === match?.groupId);
  const stageLabel = match
    ? match.stage === "GROUP"
      ? (group?.name ?? "Vòng bảng")
      : STAGE_LABELS[match.stage]
    : null;

  const rows = match
    ? ([
        { teamId: match.team1Id, score: match.score1 },
        { teamId: match.team2Id, score: match.score2 },
      ] as const)
    : [];

  return (
    <section
      className={cn(
        "flex flex-col rounded-3xl border bg-ink-850 p-5 sm:p-6",
        match?.status === "LIVE" ? "border-live-500/60" : "border-ink-700",
        className,
      )}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black uppercase tracking-wider text-ink-100 sm:text-2xl">
          {court.name}
        </h2>
        {match ? (
          match.status === "LIVE" ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-live-500/15 px-3 py-1 text-sm font-bold uppercase tracking-wider text-live-400">
              <LiveDot />
              Live
            </span>
          ) : (
            <Badge tone="neutral">#{match.code}</Badge>
          )
        ) : (
          <Badge tone="neutral">Sân trống</Badge>
        )}
      </header>

      {!match ? (
        <div className="flex flex-1 items-center justify-center py-10 text-center text-ink-500">
          Chưa có trận thi đấu
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400">
            Trận #{match.code} · {stageLabel} · chạm {match.targetScore}
          </p>
          <div className="flex-1 space-y-2">
            {rows.map((row, index) => {
              const team = teams.find((t) => t.id === row.teamId);
              const isWinner = match.status === "FINISHED" && match.winnerId === row.teamId;
              const isLeading = match.status === "LIVE" && row.score > (index === 0 ? match.score2 : match.score1);

              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-center justify-between gap-4 rounded-2xl px-4 py-3",
                    isWinner ? "bg-brand-500/15" : "bg-ink-800/70",
                  )}
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate text-xl font-bold sm:text-2xl",
                        isWinner ? "text-brand-400" : "text-ink-100",
                      )}
                    >
                      {team?.name ?? "Chưa xác định"}
                    </p>
                    {team?.players.length ? (
                      <p className="mt-0.5 truncate text-sm text-ink-400">
                        {team.players.map((player) => player.name).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      "tabular shrink-0 text-5xl font-black leading-none sm:text-6xl lg:text-7xl",
                      isWinner
                        ? "text-brand-400"
                        : isLeading
                          ? "text-live-400"
                          : "text-ink-100",
                    )}
                  >
                    {row.score}
                  </p>
                </div>
              );
            })}
          </div>

          {match.status === "FINISHED" ? (
            <p className="mt-4 text-center text-sm font-bold uppercase tracking-widest text-brand-400">
              🏆 {teams.find((t) => t.id === match.winnerId)?.name ?? "Đội thắng"} thắng{" "}
              {Math.max(match.score1, match.score2)} - {Math.min(match.score1, match.score2)}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
