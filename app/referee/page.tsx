"use client";

/**
 * Trọng tài chọn sân mình phụ trách. Lựa chọn được nhớ ở localStorage để lần
 * sau vào thẳng sân đó.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardList, MapPin } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/layout/AuthGate";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge, MatchStatusBadge } from "@/components/ui/Badge";
import { EmptyState, PageLoading } from "@/components/ui/States";
import { TeamName } from "@/components/match/TeamName";
import { useCourts } from "@/hooks/useCourts";
import { useTournament } from "@/hooks/useTournament";

const LAST_COURT_KEY = "pickleball.lastCourtId";

export default function RefereePage() {
  const { tournament, teams, loading, configured } = useTournament();
  const { courtsWithMatches } = useCourts();
  const [lastCourtId, setLastCourtId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLastCourtId(window.localStorage.getItem(LAST_COURT_KEY));
    } catch {
      /* bỏ qua */
    }
  }, []);

  if (!configured) {
    return (
      <AppShell>
        <SetupNotice />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AuthGate require="SCORER">
        {loading ? (
          <PageLoading />
        ) : !tournament ? (
          <EmptyState title="Chưa có giải đấu" description="Ban tổ chức cần tạo giải trước." />
        ) : (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-strong">Chọn sân bạn phụ trách</h1>
              <p className="mt-1 text-sm text-mute">{tournament.name}</p>
            </div>

            {courtsWithMatches.length === 0 ? (
              <EmptyState
                title="Chưa có sân nào"
                description="Ban tổ chức cần tạo sân trong phần Cài đặt giải."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {courtsWithMatches.map(({ court, liveMatch, nextMatch }) => {
                  const match = liveMatch ?? nextMatch;
                  return (
                    <Card key={court.id}>
                      <CardHeader
                        icon={<MapPin className="h-5 w-5" />}
                        title={court.name}
                        description={liveMatch ? "Đang có trận thi đấu" : "Sân trống"}
                        action={
                          lastCourtId === court.id ? <Badge tone="info">Lần trước</Badge> : null
                        }
                      />
                      <CardBody className="space-y-3">
                        {match ? (
                          <div className="space-y-1.5 rounded-xl bg-subtle/60 p-3">
                            <div className="flex items-center justify-between text-xs text-mute">
                              <span className="font-semibold text-body">#{match.code}</span>
                              <MatchStatusBadge status={match.status} />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <TeamName teamId={match.team1Id} match={match} slot={1} teams={teams} className="text-sm" />
                              <span className="tabular text-lg font-bold text-strong">
                                {match.score1}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <TeamName teamId={match.team2Id} match={match} slot={2} teams={teams} className="text-sm" />
                              <span className="tabular text-lg font-bold text-strong">
                                {match.score2}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="rounded-xl bg-subtle/60 p-3 text-sm text-mute">
                            Chưa có trận nào được phân cho sân này.
                          </p>
                        )}

                        <Link href={`/referee/court/${court.id}`} className="block">
                          <Button
                            variant="primary"
                            size="lg"
                            fullWidth
                            icon={<ClipboardList className="h-5 w-5" />}
                          >
                            Vào bàn điểm
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </AuthGate>
    </AppShell>
  );
}
