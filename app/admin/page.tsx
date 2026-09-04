"use client";

/**
 * DASHBOARD BAN TỔ CHỨC — nhìn một màn hình biết cả giải đang chạy thế nào.
 */
import Link from "next/link";
import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Flag,
  ListChecks,
  MapPin,
  PlayCircle,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, StatTile } from "@/components/ui/Card";
import { TournamentStatusBadge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState, PageLoading, ValidationList } from "@/components/ui/States";
import { MatchCard } from "@/components/match/MatchCard";
import { QuickScore } from "@/components/match/QuickScore";
import { useTournament } from "@/hooks/useTournament";
import { useMatches } from "@/hooks/useMatches";
import { useCourts } from "@/hooks/useCourts";
import { useStandings } from "@/hooks/useStandings";
import { useKnockout } from "@/hooks/useKnockout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { startTournament } from "@/lib/firestore/tournaments";
import { createKnockout, syncKnockout } from "@/lib/firestore/knockout";
import { canStartTournament } from "@/lib/tournament/validation";

export default function AdminDashboardPage() {
  const { tournament, teams, groups, courts, loading } = useTournament();
  const { matches, groupMatches, liveMatches, groupProgress, knockoutProgress } = useMatches();
  const { courtsWithMatches } = useCourts();
  const standings = useStandings();
  const knockout = useKnockout();
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();

  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmKnockout, setConfirmKnockout] = useState(false);
  const [working, setWorking] = useState(false);

  if (loading) return <PageLoading />;
  if (!tournament) {
    return (
      <EmptyState
        title="Chưa chọn giải đấu"
        description="Tạo giải mới hoặc chọn giải ở thanh trên."
        action={
          <Link href="/admin/setup">
            <Button variant="primary">Tạo giải mới</Button>
          </Link>
        }
      />
    );
  }

  const startCheck = canStartTournament(tournament, teams, groups, courts, matches);

  const handleStart = async () => {
    setWorking(true);
    try {
      await startTournament(tournament, teams, groups, courts, matches, actor);
      notify("Giải đã bắt đầu. Chúc thi đấu thành công!", "success");
      setConfirmStart(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setWorking(false);
    }
  };

  const handleCreateKnockout = async () => {
    setWorking(true);
    try {
      const count = await createKnockout(tournament, groups, teams, courts, matches, actor);
      notify(`Đã tạo ${count} trận knockout.`, "success");
      setConfirmKnockout(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setWorking(false);
    }
  };

  const handleSync = async () => {
    setWorking(true);
    try {
      const result = await syncKnockout(tournament, groups, teams, matches, actor);
      notify(
        result.updated > 0
          ? `Đã cập nhật đội cho ${result.updated} trận knockout.`
          : "Nhánh knockout đã khớp với kết quả hiện tại.",
        "success",
      );
      if (result.conflicts.length) {
        notify(`${result.conflicts.length} trận cần mở lại để cập nhật đội.`, "warning");
      }
    } catch (error) {
      notifyError(error);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <TournamentStatusBadge status={tournament.status} />
              <h1 className="mt-2 text-2xl font-bold text-ink-100">{tournament.name}</h1>
              <p className="mt-1 text-sm text-ink-400">
                {teams.length} đội · {groups.length} bảng · {courts.length} sân · chạm{" "}
                {tournament.config.groupTargetScore}/{tournament.config.knockoutTargetScore}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tournament.status === "DRAFT" ? (
                <Button
                  variant="primary"
                  onClick={() => setConfirmStart(true)}
                  disabled={!startCheck.ok}
                  icon={<PlayCircle className="h-4 w-4" />}
                >
                  Bắt đầu giải
                </Button>
              ) : null}
              {tournament.status === "GROUP_STAGE" ? (
                <Button
                  variant="primary"
                  onClick={() => setConfirmKnockout(true)}
                  disabled={!knockout.canCreate}
                  icon={<Trophy className="h-4 w-4" />}
                >
                  Tạo knockout
                </Button>
              ) : null}
              {knockout.hasKnockout ? (
                <Button variant="secondary" loading={working} onClick={handleSync}>
                  Đồng bộ nhánh
                </Button>
              ) : null}
            </div>
          </div>

          {tournament.status === "DRAFT" && !startCheck.ok ? (
            <ValidationList errors={startCheck.errors} warnings={startCheck.warnings} />
          ) : null}
          {tournament.status === "GROUP_STAGE" && !knockout.canCreate ? (
            <ValidationList errors={knockout.createErrors} />
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Trận vòng bảng" value={`${groupProgress.finished}/${groupProgress.total}`} />
            <StatTile label="Đang đấu" value={groupProgress.live + knockoutProgress.live} tone="live" />
            <StatTile label="Còn lại" value={groupProgress.remaining} tone="warning" />
            <StatTile
              label="Knockout"
              value={
                knockout.hasKnockout
                  ? `${knockoutProgress.finished}/${knockoutProgress.total}`
                  : "—"
              }
              tone="success"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<MapPin className="h-5 w-5" />}
          title="Sân thi đấu"
          description="Nhập điểm nhanh ngay tại đây khi cần."
          action={
            <Link href="/admin/matches">
              <Button variant="ghost" size="sm" className="border border-ink-700">
                Quản lý trận
              </Button>
            </Link>
          }
        />
        <CardBody className="grid gap-3 md:grid-cols-2">
          {courtsWithMatches.length === 0 ? (
            <p className="col-span-full py-3 text-center text-sm text-ink-500">
              Chưa có sân nào. Thêm sân trong phần Cài đặt.
            </p>
          ) : (
            courtsWithMatches.map(({ court, liveMatch, nextMatch }) => {
              const match = liveMatch ?? nextMatch;
              return (
                <div key={court.id} className="rounded-xl border border-ink-700/70 bg-ink-800/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-ink-100">{court.name}</h3>
                    <span className="text-xs text-ink-400">
                      {liveMatch ? "Đang thi đấu" : nextMatch ? "Trận kế tiếp" : "Trống"}
                    </span>
                  </div>
                  {match ? (
                    <MatchCard
                      match={match}
                      teams={teams}
                      groups={groups}
                      courts={courts}
                      compact
                      actions={<QuickScore match={match} />}
                    />
                  ) : (
                    <p className="py-4 text-center text-sm text-ink-500">Không có trận nào.</p>
                  )}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<Activity className="h-5 w-5" />}
            title="Đang thi đấu"
            description={`${liveMatches.length} trận`}
          />
          <CardBody className="space-y-3">
            {liveMatches.length === 0 ? (
              <p className="py-3 text-center text-sm text-ink-500">Không có trận nào đang diễn ra.</p>
            ) : (
              liveMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teams={teams}
                  groups={groups}
                  courts={courts}
                  actions={<QuickScore match={match} />}
                />
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<ListChecks className="h-5 w-5" />}
            title="Tiến độ từng bảng"
            action={
              <Link href="/standings">
                <Button variant="ghost" size="sm" className="border border-ink-700">
                  Xem BXH
                </Button>
              </Link>
            }
          />
          <CardBody className="space-y-3">
            {standings.length === 0 ? (
              <p className="py-3 text-center text-sm text-ink-500">Chưa chia bảng.</p>
            ) : (
              standings.map(({ group, rows, complete }) => {
                const total = groupMatches.filter((m) => m.groupId === group.id).length;
                const done = groupMatches.filter(
                  (m) => m.groupId === group.id && m.status === "FINISHED",
                ).length;
                const percent = total ? Math.round((done / total) * 100) : 0;

                return (
                  <div key={group.id} className="rounded-xl bg-ink-800/40 p-3">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-semibold text-ink-100">
                        {group.name}
                        <span className="ml-2 text-xs font-normal text-ink-400">
                          <Users className="mr-1 inline h-3 w-3" />
                          {rows.length} đội
                        </span>
                      </span>
                      <span className="tabular flex items-center gap-1 text-ink-300">
                        {complete ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-brand-400" />
                        ) : (
                          <Flag className="h-3.5 w-3.5 text-warn-400" />
                        )}
                        {done}/{total}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-2 truncate text-xs text-ink-400">
                      Dẫn đầu: {rows[0]?.teamName ?? "—"}
                    </p>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmStart}
        title="Bắt đầu giải?"
        message={`Giải "${tournament.name}" sẽ chuyển sang trạng thái VÒNG BẢNG và trọng tài có thể nhập điểm.`}
        warnings={startCheck.warnings}
        confirmLabel="Bắt đầu"
        loading={working}
        onConfirm={handleStart}
        onCancel={() => setConfirmStart(false)}
      />

      <ConfirmDialog
        open={confirmKnockout}
        title="Tạo nhánh knockout?"
        message="Hệ thống sẽ lấy các đội đứng đầu mỗi bảng theo bảng xếp hạng hiện tại và tạo các trận bán kết / chung kết."
        warnings={knockout.createWarnings}
        confirmLabel="Tạo knockout"
        loading={working}
        onConfirm={handleCreateKnockout}
        onCancel={() => setConfirmKnockout(false)}
      />
    </div>
  );
}
