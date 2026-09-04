"use client";

/**
 * Một dòng trận trong trang quản trị: phân sân, bắt đầu, nhập điểm nhanh,
 * kết thúc, mở lại, sửa kết quả, huỷ trận.
 *
 * Mọi hành động nguy hiểm đều đi kèm confirm và tự dọn dẹp nhánh knockout.
 */
import { useState } from "react";
import { Ban, PenLine, RotateCcw, Undo2 } from "lucide-react";
import type { Match } from "@/types/tournament";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { MatchCard } from "./MatchCard";
import { QuickScore } from "./QuickScore";
import { EditResultDialog } from "./EditResultDialog";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { assignCourt, cancelMatch, reopenMatch, restoreMatch } from "@/lib/firestore/matches";
import { refreshBracketAfterResult } from "@/lib/firestore/knockout";
import { canReopenMatch } from "@/lib/tournament/validation";
import { isKnockoutStage } from "@/lib/tournament/knockout";

export function AdminMatchRow({ match }: { match: Match }) {
  const { tournament, teams, groups, courts, matches } = useTournamentContext();
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();

  const [confirmReopen, setConfirmReopen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const reopenCheck = canReopenMatch(match, matches);

  const handleCourtChange = async (courtId: string) => {
    if (!tournament) return;
    try {
      await assignCourt(tournament.id, match, courtId || undefined, matches, actor);
    } catch (error) {
      notifyError(error);
    }
  };

  const handleReopen = async () => {
    if (!tournament) return;
    setWorking(true);
    try {
      await reopenMatch(tournament.id, match.id, actor);
      // Kết quả cũ không còn giá trị -> dọn các trận phía sau rồi ghép lại nhánh.
      if (matches.some((m) => isKnockoutStage(m.stage))) {
        const patched = matches.map((m) =>
          m.id === match.id
            ? { ...m, status: "LIVE" as const, winnerId: undefined, loserId: undefined }
            : m,
        );
        await refreshBracketAfterResult(
          tournament,
          groups,
          teams,
          patched,
          match.id,
          { resetDependents: true },
          actor,
        );
      }
      notify(`Đã mở lại trận #${match.code}.`, "success");
      setConfirmReopen(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setWorking(false);
    }
  };

  const handleCancel = async () => {
    if (!tournament) return;
    setWorking(true);
    try {
      await cancelMatch(tournament.id, match, actor);
      notify(`Đã huỷ trận #${match.code}.`, "success");
      setConfirmCancel(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setWorking(false);
    }
  };

  const handleRestore = async () => {
    if (!tournament) return;
    try {
      await restoreMatch(tournament.id, match.id);
      notify(`Trận #${match.code} đã trở lại lịch.`, "success");
    } catch (error) {
      notifyError(error);
    }
  };

  const actions = (
    <div className="flex w-full flex-wrap items-center gap-2">
      {match.status !== "FINISHED" && match.status !== "CANCELLED" ? (
        <Select
          aria-label={`Phân sân cho trận #${match.code}`}
          className="h-8 w-28! py-0 text-xs"
          value={match.courtId ?? ""}
          onChange={(event) => void handleCourtChange(event.target.value)}
        >
          <option value="">Chưa phân sân</option>
          {courts.map((court) => (
            <option key={court.id} value={court.id}>
              {court.name}
            </option>
          ))}
        </Select>
      ) : null}

      <QuickScore match={match} />

      {match.status === "FINISHED" ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="border border-line"
            onClick={() => setEditOpen(true)}
            icon={<PenLine className="h-3.5 w-3.5" />}
          >
            Sửa tỷ số
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="border border-warn-500/40 text-warn-400"
            onClick={() => setConfirmReopen(true)}
            icon={<Undo2 className="h-3.5 w-3.5" />}
          >
            Mở lại trận
          </Button>
        </>
      ) : null}

      {match.status === "SCHEDULED" ? (
        <Button
          variant="ghost"
          size="sm"
          className="border border-line text-mute"
          onClick={() => setConfirmCancel(true)}
          icon={<Ban className="h-3.5 w-3.5" />}
        >
          Huỷ
        </Button>
      ) : null}

      {match.status === "CANCELLED" ? (
        <Button
          variant="ghost"
          size="sm"
          className="border border-line"
          onClick={() => void handleRestore()}
          icon={<RotateCcw className="h-3.5 w-3.5" />}
        >
          Khôi phục
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <MatchCard
        match={match}
        teams={teams}
        groups={groups}
        courts={courts}
        compact
        actions={actions}
      />

      <ConfirmDialog
        open={confirmReopen}
        title={`Mở lại trận #${match.code}?`}
        message="Trận sẽ trở lại trạng thái ĐANG ĐẤU để sửa điểm. Kết quả cũ bị xoá khỏi bảng xếp hạng cho tới khi kết thúc lại."
        warnings={reopenCheck.warnings}
        confirmLabel="Mở lại trận"
        danger
        loading={working}
        onConfirm={handleReopen}
        onCancel={() => setConfirmReopen(false)}
      />

      <ConfirmDialog
        open={confirmCancel}
        title={`Huỷ trận #${match.code}?`}
        message="Trận sẽ không được tính vào bảng xếp hạng. Có thể khôi phục lại sau."
        confirmLabel="Huỷ trận"
        danger
        loading={working}
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancel(false)}
      />

      <EditResultDialog open={editOpen} match={match} onClose={() => setEditOpen(false)} />
    </>
  );
}
