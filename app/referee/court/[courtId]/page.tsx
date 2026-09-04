"use client";

/**
 * BÀN ĐIỂM CỦA MỘT SÂN.
 *
 * Màn hình tối giản: chỉ trận đang diễn ra + nút cộng điểm. Nếu sân trống thì
 * hiện danh sách trận kế tiếp để trọng tài gọi ra sân.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ListChecks, Play } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/layout/AuthGate";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, PageLoading } from "@/components/ui/States";
import { MatchCard } from "@/components/match/MatchCard";
import { ScorePad } from "@/components/scoring/ScorePad";
import { useCourt } from "@/hooks/useCourts";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { getUpcomingMatches } from "@/lib/tournament/tournament";
import { assignCourt, startMatch } from "@/lib/firestore/matches";

const LAST_COURT_KEY = "pickleball.lastCourtId";

export default function RefereeCourtPage() {
  const params = useParams<{ courtId: string }>();
  const courtParam = params?.courtId ?? "";
  const { tournament, teams, groups, courts, matches, loading } = useTournamentContext();
  const courtState = useCourt(courtParam);
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!courtState) return;
    try {
      window.localStorage.setItem(LAST_COURT_KEY, courtState.court.id);
    } catch {
      /* bỏ qua */
    }
  }, [courtState]);

  const queue = useMemo(() => {
    if (!courtState) return [];
    return getUpcomingMatches(matches, courtState.court.id).slice(0, 6);
  }, [matches, courtState]);

  const handleCallToCourt = async (matchId: string) => {
    if (!tournament || !courtState) return;
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    setStarting(matchId);
    try {
      if (match.courtId !== courtState.court.id) {
        await assignCourt(tournament.id, match, courtState.court.id, matches, actor);
      }
      await startMatch(
        tournament.id,
        { ...match, courtId: courtState.court.id },
        matches,
        actor,
      );
      notify(`Trận #${match.code} đã vào sân.`, "success");
    } catch (error) {
      notifyError(error);
    } finally {
      setStarting(null);
    }
  };

  return (
    <AppShell className="max-w-3xl">
      <AuthGate require="SCORER">
        {loading ? (
          <PageLoading />
        ) : !courtState ? (
          <EmptyState
            title="Không tìm thấy sân"
            description={`Sân "${courtParam}" không tồn tại trong giải đang chọn.`}
            action={
              <Link href="/referee">
                <Button variant="primary">Chọn sân khác</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Link href="/referee">
                <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
                  Đổi sân
                </Button>
              </Link>
              <h1 className="text-lg font-bold text-ink-100">{courtState.court.name}</h1>
            </div>

            {courtState.liveMatch ? (
              <ScorePad match={courtState.liveMatch} court={courtState.court} />
            ) : (
              <Card>
                <CardHeader
                  icon={<ListChecks className="h-5 w-5" />}
                  title="Sân đang trống"
                  description="Chọn trận kế tiếp để gọi ra sân."
                />
                <CardBody className="space-y-3">
                  {queue.length === 0 ? (
                    <EmptyState
                      title="Không còn trận nào chờ"
                      description="Tất cả các trận của sân này đã thi đấu xong."
                    />
                  ) : (
                    queue.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        teams={teams}
                        groups={groups}
                        courts={courts}
                        compact
                        actions={
                          <Button
                            variant="primary"
                            size="lg"
                            fullWidth
                            loading={starting === match.id}
                            onClick={() => void handleCallToCourt(match.id)}
                            icon={<Play className="h-4 w-4" />}
                          >
                            Gọi ra sân & bắt đầu
                          </Button>
                        }
                      />
                    ))
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </AuthGate>
    </AppShell>
  );
}
