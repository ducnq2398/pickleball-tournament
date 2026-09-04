"use client";

import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState, PageLoading } from "@/components/ui/States";
import { ChampionBanner } from "@/components/knockout/ChampionBanner";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { useTournament } from "@/hooks/useTournament";
import { useKnockout } from "@/hooks/useKnockout";
import { useStandings } from "@/hooks/useStandings";
import { findTeam } from "@/lib/tournament/tournament";

export default function ChampionPage() {
  const { tournament, teams, loading, configured } = useTournament();
  const { championTeamId, runnerUpTeamId, thirdPlaceTeamId, hasKnockout } = useKnockout();
  const standings = useStandings();

  if (!configured) {
    return (
      <AppShell>
        <SetupNotice />
      </AppShell>
    );
  }

  const champion = findTeam(teams, championTeamId);

  return (
    <AppShell>
      {loading ? (
        <PageLoading />
      ) : !tournament ? (
        <EmptyState title="Chưa có giải đấu" />
      ) : !champion ? (
        <EmptyState
          icon={<PartyPopper className="h-10 w-10" />}
          title="Giải chưa có nhà vô địch"
          description={
            hasKnockout
              ? "Trận chung kết chưa kết thúc."
              : "Nhánh knockout chưa được tạo."
          }
          action={
            <Link href="/knockout">
              <Button variant="primary">Xem nhánh knockout</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <ChampionBanner
            champion={champion}
            runnerUp={findTeam(teams, runnerUpTeamId)}
            thirdPlace={findTeam(teams, thirdPlaceTeamId)}
            showLink={false}
          />

          <p className="text-center text-lg font-semibold text-ink-200">
            Chúc mừng {champion.name} đã vô địch {tournament.name}!
          </p>

          <div className="grid gap-4 xl:grid-cols-2">
            {standings.map(({ group, rows }) => (
              <Card key={group.id}>
                <CardBody>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-300">
                    {group.name}
                  </h3>
                  <StandingsTable rows={rows} qualificationSlots={group.qualificationSlots} complete />
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="flex justify-center gap-2">
            <Link href="/knockout">
              <Button variant="secondary">Nhánh knockout</Button>
            </Link>
            <Link href="/standings">
              <Button variant="ghost" className="border border-ink-700">
                Bảng xếp hạng
              </Button>
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
