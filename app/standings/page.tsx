"use client";

import { ListOrdered } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, PageLoading } from "@/components/ui/States";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { MatchCard } from "@/components/match/MatchCard";
import { useTournament } from "@/hooks/useTournament";
import { useStandings } from "@/hooks/useStandings";
import { useMatches } from "@/hooks/useMatches";
import { RANKING_RULE_LABELS } from "@/lib/tournament/standings";

export default function StandingsPage() {
  const { tournament, teams, groups, courts, loading, configured } = useTournament();
  const standings = useStandings();
  const { groupMatches } = useMatches();

  if (!configured) {
    return (
      <AppShell>
        <SetupNotice />
      </AppShell>
    );
  }

  const rules = tournament?.config.rankingRules ?? [];

  return (
    <AppShell>
      {loading ? (
        <PageLoading />
      ) : !tournament ? (
        <EmptyState title="Chưa có giải đấu" />
      ) : (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-strong">Bảng xếp hạng</h1>
            <p className="mt-1 text-sm text-mute">
              Thứ tự ưu tiên: {rules.map((rule) => RANKING_RULE_LABELS[rule]).join(" → ")}
            </p>
          </div>

          {standings.length === 0 ? (
            <EmptyState title="Chưa chia bảng" description="Ban tổ chức cần tạo bảng và xếp đội." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {standings.map(({ group, rows, complete }) => (
                <Card key={group.id}>
                  <CardHeader
                    icon={<ListOrdered className="h-5 w-5" />}
                    title={group.name}
                    description={`${rows.length} đội · ${group.qualificationSlots} suất đi tiếp`}
                    action={
                      complete ? (
                        <Badge tone="success">Đã đá xong</Badge>
                      ) : (
                        <Badge tone="warning">Đang thi đấu</Badge>
                      )
                    }
                  />
                  <CardBody>
                    <StandingsTable
                      rows={rows}
                      qualificationSlots={group.qualificationSlots}
                      complete={complete}
                    />
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardHeader
              title="Lịch & kết quả vòng bảng"
              description={`${groupMatches.filter((m) => m.status === "FINISHED").length}/${groupMatches.length} trận đã hoàn thành`}
            />
            <CardBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groupMatches.length === 0 ? (
                <p className="col-span-full py-4 text-center text-sm text-faint">
                  Chưa sinh lịch thi đấu.
                </p>
              ) : (
                groupMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    teams={teams}
                    groups={groups}
                    courts={courts}
                    compact
                  />
                ))
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
