"use client";

/**
 * BẢNG ĐIỂM CÔNG KHAI — thiết kế cho TV/máy chiếu ở nhà thi đấu.
 * Không cần đăng nhập, tỷ số tự cập nhật qua onSnapshot.
 */
import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, PageLoading } from "@/components/ui/States";
import { CourtPanel } from "@/components/court/CourtPanel";
import { TeamName } from "@/components/match/TeamName";
import { useTournament } from "@/hooks/useTournament";
import { useCourts } from "@/hooks/useCourts";
import { useMatches } from "@/hooks/useMatches";
import { STAGE_LABELS } from "@/lib/tournament/knockout";
import { cn } from "@/lib/utils";

export default function ScoreboardPage() {
  const { tournament, teams, groups, loading, configured } = useTournament();
  const { courtsWithMatches } = useCourts();
  const { recentResults, upcoming } = useMatches();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  if (!configured) {
    return (
      <AppShell>
        <SetupNotice />
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      {loading ? (
        <PageLoading />
      ) : !tournament ? (
        <EmptyState title="Chưa có giải đấu" description="Ban tổ chức cần tạo giải trước." />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-ink-100 sm:text-4xl">
                {tournament.name}
              </h1>
              {tournament.location ? (
                <p className="mt-1 text-sm text-ink-400">{tournament.location}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              onClick={toggleFullscreen}
              icon={isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              className="border border-ink-700"
            >
              {isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
            </Button>
          </div>

          {courtsWithMatches.length === 0 ? (
            <EmptyState title="Chưa có sân thi đấu" />
          ) : (
            <div
              className={cn(
                "grid gap-4",
                courtsWithMatches.length === 1 ? "grid-cols-1" : "md:grid-cols-2",
                courtsWithMatches.length > 4 && "xl:grid-cols-3",
              )}
            >
              {courtsWithMatches.map(({ court, liveMatch, nextMatch }) => (
                <CourtPanel
                  key={court.id}
                  court={court}
                  match={liveMatch ?? nextMatch}
                  teams={teams}
                  groups={groups}
                  className="min-h-[16rem]"
                />
              ))}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Kết quả gần nhất" />
              <CardBody className="space-y-2">
                {recentResults.length === 0 ? (
                  <p className="py-4 text-center text-sm text-ink-500">Chưa có trận nào kết thúc.</p>
                ) : (
                  recentResults.map((match) => (
                    <div
                      key={match.id}
                      className="flex items-center gap-3 rounded-xl bg-ink-800/50 px-3 py-2.5"
                    >
                      <span className="w-10 shrink-0 text-xs font-semibold text-ink-500">
                        #{match.code}
                      </span>
                      <TeamName
                        teamId={match.team1Id}
                        match={match}
                        slot={1}
                        teams={teams}
                        className={cn(
                          "flex-1 truncate text-sm",
                          match.winnerId === match.team1Id && "text-brand-400",
                        )}
                      />
                      <span className="tabular shrink-0 rounded-lg bg-ink-900 px-2.5 py-1 text-sm font-bold text-ink-100">
                        {match.score1} - {match.score2}
                      </span>
                      <TeamName
                        teamId={match.team2Id}
                        match={match}
                        slot={2}
                        teams={teams}
                        className={cn(
                          "flex-1 truncate text-right text-sm",
                          match.winnerId === match.team2Id && "text-brand-400",
                        )}
                      />
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Sắp thi đấu" />
              <CardBody className="space-y-2">
                {upcoming.length === 0 ? (
                  <p className="py-4 text-center text-sm text-ink-500">
                    Không còn trận nào trong lịch.
                  </p>
                ) : (
                  upcoming.slice(0, 8).map((match) => (
                    <div
                      key={match.id}
                      className="flex items-center gap-3 rounded-xl bg-ink-800/50 px-3 py-2.5 text-sm"
                    >
                      <span className="w-10 shrink-0 text-xs font-semibold text-ink-500">
                        #{match.code}
                      </span>
                      <TeamName teamId={match.team1Id} match={match} slot={1} teams={teams} className="flex-1 truncate" />
                      <span className="shrink-0 text-xs text-ink-500">vs</span>
                      <TeamName teamId={match.team2Id} match={match} slot={2} teams={teams} className="flex-1 truncate text-right" />
                      <span className="hidden w-24 shrink-0 text-right text-xs text-ink-500 sm:block">
                        {match.stage === "GROUP"
                          ? (groups.find((g) => g.id === match.groupId)?.name ?? "")
                          : STAGE_LABELS[match.stage]}
                      </span>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
