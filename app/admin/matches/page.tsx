"use client";

/**
 * Quản lý toàn bộ trận: sinh lịch, phân sân, điều hành, tạo knockout.
 */
import { useMemo, useState } from "react";
import { CalendarPlus, Filter, ListChecks, Trophy } from "lucide-react";
import type { MatchStatus } from "@/types/tournament";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, StatTile } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import { EmptyState, PageLoading, ValidationList } from "@/components/ui/States";
import { AdminMatchRow } from "@/components/match/AdminMatchRow";
import { BracketView } from "@/components/knockout/BracketView";
import { useTournament } from "@/hooks/useTournament";
import { useMatches } from "@/hooks/useMatches";
import { useKnockout } from "@/hooks/useKnockout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { generateGroupMatches } from "@/lib/firestore/matches";
import { createKnockout } from "@/lib/firestore/knockout";
import { canGenerateSchedule } from "@/lib/tournament/validation";
import { expectedGroupMatchCount } from "@/lib/tournament/schedule";
import { MATCH_STATUS_LABELS } from "@/lib/tournament/tournament";

const STATUS_OPTIONS: (MatchStatus | "ALL")[] = ["ALL", "SCHEDULED", "LIVE", "FINISHED", "CANCELLED"];

export default function AdminMatchesPage() {
  const { tournament, teams, groups, courts, loading } = useTournament();
  const { matches, groupMatches, groupProgress } = useMatches();
  const knockout = useKnockout();
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();

  const [statusFilter, setStatusFilter] = useState<MatchStatus | "ALL">("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [courtFilter, setCourtFilter] = useState<string>("ALL");
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [confirmKnockout, setConfirmKnockout] = useState(false);
  const [working, setWorking] = useState(false);

  const scheduleCheck = useMemo(
    () => canGenerateSchedule(groups, teams, matches),
    [groups, teams, matches],
  );

  const filtered = useMemo(
    () =>
      groupMatches.filter((match) => {
        if (statusFilter !== "ALL" && match.status !== statusFilter) return false;
        if (groupFilter !== "ALL" && match.groupId !== groupFilter) return false;
        if (courtFilter !== "ALL" && match.courtId !== courtFilter) return false;
        return true;
      }),
    [groupMatches, statusFilter, groupFilter, courtFilter],
  );

  const handleGenerate = async () => {
    if (!tournament) return;
    setWorking(true);
    try {
      const count = await generateGroupMatches(tournament, groups, teams, courts, matches, actor);
      notify(`Đã sinh ${count} trận vòng bảng.`, "success");
      setConfirmGenerate(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setWorking(false);
    }
  };

  const handleKnockout = async () => {
    if (!tournament) return;
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

  if (loading) return <PageLoading />;
  if (!tournament) return <EmptyState title="Chưa chọn giải đấu" />;

  const expected = expectedGroupMatchCount(groups);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<ListChecks className="h-5 w-5" />}
          title="Lịch thi đấu"
          description={`Cấu hình bảng hiện tại cần ${expected} trận vòng bảng`}
          action={
            <>
              <Button
                variant={groupMatches.length ? "ghost" : "primary"}
                size="sm"
                className={groupMatches.length ? "border border-line" : undefined}
                onClick={() => setConfirmGenerate(true)}
                disabled={!scheduleCheck.ok}
                icon={<CalendarPlus className="h-4 w-4" />}
              >
                {groupMatches.length ? "Sinh lại lịch" : "Sinh lịch vòng bảng"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirmKnockout(true)}
                disabled={!knockout.canCreate}
                icon={<Trophy className="h-4 w-4" />}
              >
                {knockout.hasKnockout ? "Tạo lại knockout" : "Tạo knockout"}
              </Button>
            </>
          }
        />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Tổng trận" value={groupProgress.total} />
            <StatTile label="Đã xong" value={groupProgress.finished} tone="success" />
            <StatTile label="Đang đấu" value={groupProgress.live} tone="live" />
            <StatTile label="Chưa đấu" value={groupProgress.scheduled} tone="warning" />
          </div>
          {!scheduleCheck.ok ? <ValidationList errors={scheduleCheck.errors} /> : null}
          {!knockout.canCreate && knockout.createErrors.length ? (
            <ValidationList warnings={knockout.createErrors} />
          ) : null}
        </CardBody>
      </Card>

      {knockout.hasKnockout ? (
        <Card>
          <CardHeader
            icon={<Trophy className="h-5 w-5" />}
            title="Nhánh knockout"
            description={`${knockout.knockoutMatches.filter((m) => m.status === "FINISHED").length}/${knockout.knockoutMatches.length} trận đã xong`}
          />
          <CardBody className="space-y-4">
            <BracketView rounds={knockout.rounds} teams={teams} courts={courts} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {knockout.knockoutMatches.map((match) => (
                <AdminMatchRow key={match.id} match={match} />
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          icon={<Filter className="h-5 w-5" />}
          title="Trận vòng bảng"
          description={`Hiển thị ${filtered.length}/${groupMatches.length} trận`}
          action={
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label="Lọc theo trạng thái"
                className="h-8 w-32 py-0 text-xs"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as MatchStatus | "ALL")}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status === "ALL" ? "Tất cả trạng thái" : MATCH_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Lọc theo bảng"
                className="h-8 w-28 py-0 text-xs"
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
              >
                <option value="ALL">Tất cả bảng</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Lọc theo sân"
                className="h-8 w-28 py-0 text-xs"
                value={courtFilter}
                onChange={(event) => setCourtFilter(event.target.value)}
              >
                <option value="ALL">Tất cả sân</option>
                {courts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        <CardBody>
          {groupMatches.length === 0 ? (
            <EmptyState
              title="Chưa có lịch thi đấu"
              description={`Bấm "Sinh lịch vòng bảng" để tạo ${expected} trận theo thể thức vòng tròn.`}
              action={
                <Button variant="primary" onClick={() => setConfirmGenerate(true)} disabled={!scheduleCheck.ok}>
                  Sinh lịch vòng bảng
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              Không có trận nào khớp bộ lọc.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((match) => (
                <AdminMatchRow key={match.id} match={match} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmGenerate}
        title="Sinh lại lịch thi đấu?"
        danger={groupMatches.length > 0}
        message={
          <>
            Hệ thống sẽ tạo {expected} trận vòng tròn cho {groups.length} bảng và phân luân phiên
            vào {courts.length} sân.
            {groupMatches.length > 0
              ? " Toàn bộ trận hiện tại (kể cả kết quả đã nhập) sẽ bị xoá."
              : ""}
          </>
        }
        warnings={scheduleCheck.warnings}
        confirmLabel="Sinh lịch"
        loading={working}
        onConfirm={handleGenerate}
        onCancel={() => setConfirmGenerate(false)}
      />

      <ConfirmDialog
        open={confirmKnockout}
        title={knockout.hasKnockout ? "Tạo lại nhánh knockout?" : "Tạo nhánh knockout?"}
        message="Các đội đứng đầu mỗi bảng theo bảng xếp hạng hiện tại sẽ được ghép cặp tự động."
        warnings={knockout.createWarnings}
        confirmLabel="Tạo knockout"
        danger={knockout.hasKnockout}
        loading={working}
        onConfirm={handleKnockout}
        onCancel={() => setConfirmKnockout(false)}
      />
    </div>
  );
}
