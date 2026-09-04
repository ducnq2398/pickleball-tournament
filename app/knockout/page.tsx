"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, PageLoading, ValidationList } from "@/components/ui/States";
import { BracketView } from "@/components/knockout/BracketView";
import { ChampionBanner } from "@/components/knockout/ChampionBanner";
import { useTournament } from "@/hooks/useTournament";
import { useKnockout } from "@/hooks/useKnockout";
import { findTeam } from "@/lib/tournament/tournament";

export default function KnockoutPage() {
  const { tournament, teams, courts, loading, configured } = useTournament();
  const {
    rounds,
    hasKnockout,
    championTeamId,
    runnerUpTeamId,
    thirdPlaceTeamId,
    remainingGroupMatches,
  } = useKnockout();

  if (!configured) {
    return (
      <AppShell>
        <SetupNotice />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {loading ? (
        <PageLoading />
      ) : !tournament ? (
        <EmptyState title="Chưa có giải đấu" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-ink-100">Nhánh knockout</h1>
              <p className="mt-1 text-sm text-ink-400">
                Chạm {tournament.config.knockoutTargetScore}
                {tournament.config.winByTwo ? " · thắng cách biệt 2 điểm" : ""}
              </p>
            </div>
            {hasKnockout ? (
              <Link href="/standings">
                <Button variant="ghost" className="border border-ink-700">
                  Xem bảng xếp hạng
                </Button>
              </Link>
            ) : null}
          </div>

          <ChampionBanner
            champion={findTeam(teams, championTeamId)}
            runnerUp={findTeam(teams, runnerUpTeamId)}
            thirdPlace={findTeam(teams, thirdPlaceTeamId)}
          />

          {!hasKnockout ? (
            <Card>
              <CardHeader
                icon={<Trophy className="h-5 w-5" />}
                title="Chưa tạo nhánh knockout"
                description="Nhánh sẽ được tạo sau khi vòng bảng kết thúc."
              />
              <CardBody className="space-y-3">
                {remainingGroupMatches > 0 ? (
                  <ValidationList
                    warnings={[
                      `Còn ${remainingGroupMatches} trận vòng bảng chưa hoàn thành. Chưa thể tạo Knockout.`,
                    ]}
                  />
                ) : (
                  <p className="text-sm text-ink-300">
                    Vòng bảng đã xong. Ban tổ chức có thể tạo nhánh knockout trong trang quản trị.
                  </p>
                )}
                <Link href="/admin/matches">
                  <Button variant="secondary">Tới trang quản lý trận</Button>
                </Link>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <BracketView rounds={rounds} teams={teams} courts={courts} />
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}
