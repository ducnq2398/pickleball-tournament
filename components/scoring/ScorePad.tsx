"use client";

/**
 * BÀN ĐIỂM CỦA TRỌNG TÀI.
 *
 * Yêu cầu thực tế: dùng được bằng MỘT TAY, nút to, không bấm nhầm, và không
 * bao giờ mất điểm. Vì vậy:
 * - Mỗi lần bấm được đưa vào HÀNG ĐỢI tuần tự (promise chain) thay vì khoá nút:
 *   trọng tài bấm nhanh 3 lần thì cả 3 điểm đều được ghi, đúng thứ tự.
 * - Mọi luật (được cộng không, đã kết thúc chưa) đều hỏi lib/tournament/scoring.
 * - Khi mất mạng vẫn bấm được; ứng dụng nói rõ "chưa đồng bộ", không nói "đã lưu".
 */
import { useRef, useState } from "react";
import { Check, Flag, Minus, Play, Plus, RotateCcw } from "lucide-react";
import type { Court, Match, Team } from "@/types/tournament";
import { cn } from "@/lib/utils";
import {
  canAdjustScore,
  canFinishMatch,
  describeScoreState,
  evaluateMatch,
} from "@/lib/tournament/scoring";
import { STAGE_LABELS, isKnockoutStage } from "@/lib/tournament/knockout";
import { adjustScore, finishMatch, startMatch } from "@/lib/firestore/matches";
import { refreshBracketAfterResult } from "@/lib/firestore/knockout";
import { toFriendlyMessage } from "@/lib/firestore/errors";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Badge, MatchStatusBadge } from "@/components/ui/Badge";
import { OfflineBanner } from "@/components/layout/ConnectionIndicator";
import { ManualScoreDialog } from "./ManualScoreDialog";

export function ScorePad({ match, court }: { match: Match; court?: Court }) {
  const { tournament, teams, groups, matches } = useTournamentContext();
  const { actor, canScore } = useAuth();
  const { notify, notifyError } = useToast();

  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const team1 = teams.find((t) => t.id === match.team1Id);
  const team2 = teams.find((t) => t.id === match.team2Id);
  const group = groups.find((g) => g.id === match.groupId);
  const outcome = evaluateMatch(match);
  const finishCheck = canFinishMatch(match);

  /** Xếp thao tác vào hàng đợi để không mất lượt bấm nhanh. */
  const enqueue = (task: () => Promise<void>) => {
    setBusy(true);
    queueRef.current = queueRef.current
      .then(task)
      .catch((error) => notifyError(error))
      .finally(() => setBusy(false));
    return queueRef.current;
  };

  const handleAdjust = (slot: 1 | 2, delta: number) => {
    if (!tournament) return;
    const check = canAdjustScore(match, slot, delta);
    if (!check.ok) {
      notify(check.errors[0], "warning");
      return;
    }
    void enqueue(async () => {
      const result = await adjustScore(tournament.id, match, slot, delta, actor);
      if (result.queuedOffline) {
        notify("Mất mạng — điểm đã ghi tạm và sẽ tự đồng bộ khi có Internet.", "warning");
      }
    });
  };

  const handleStart = () => {
    if (!tournament) return;
    void enqueue(async () => {
      await startMatch(tournament.id, match, matches, actor);
      notify(`Bắt đầu trận #${match.code}.`, "success");
    });
  };

  const handleFinish = () => {
    if (!tournament) return;
    if (!finishCheck.ok) {
      notify(finishCheck.errors[0], "warning");
      return;
    }
    void enqueue(async () => {
      const finished = await finishMatch(tournament.id, match, actor);
      const winnerName = teams.find((t) => t.id === finished.winnerId)?.name ?? "Đội thắng";
      notify(`${winnerName} thắng ${finished.score1} - ${finished.score2}.`, "success");

      if (isKnockoutStage(finished.stage) || matches.some((m) => isKnockoutStage(m.stage))) {
        const updatedMatches = matches.map((m) => (m.id === finished.id ? finished : m));
        try {
          await refreshBracketAfterResult(
            tournament,
            groups,
            teams,
            updatedMatches,
            finished.id,
            {},
            actor,
          );
        } catch (error) {
          // Trọng tài có thể không đủ quyền ghi các trận vòng sau -> BTC sẽ đồng bộ.
          console.warn("[knockout] Không đồng bộ được nhánh:", toFriendlyMessage(error));
        }
      }
    });
  };

  if (!canScore) {
    return (
      <div className="rounded-2xl border border-warn-500/40 bg-warn-500/10 px-4 py-5 text-center text-sm text-warn-400">
        Bạn cần đăng nhập bằng tài khoản trọng tài hoặc BTC để nhập điểm.
      </div>
    );
  }

  const stageLabel = match.stage === "GROUP" ? (group?.name ?? "Vòng bảng") : STAGE_LABELS[match.stage];

  return (
    <div className="space-y-4">
      <OfflineBanner />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-ink-300">
          <span className="font-bold text-ink-100">TRẬN #{match.code}</span>
          <span className="text-ink-500">·</span>
          <span>{stageLabel}</span>
          {court ? (
            <>
              <span className="text-ink-500">·</span>
              <span className="font-semibold text-info-400">{court.name}</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info">Chạm {match.targetScore}</Badge>
          {match.winByTwo ? <Badge tone="neutral">Hơn 2 điểm</Badge> : null}
          <MatchStatusBadge status={match.status} />
        </div>
      </div>

      <div className="grid gap-3">
        {([1, 2] as const).map((slot) => {
          const team = slot === 1 ? team1 : team2;
          const score = slot === 1 ? match.score1 : match.score2;
          const isWinner = match.status === "FINISHED" && match.winnerId === team?.id;
          const canAdd = canAdjustScore(match, slot, 1).ok;
          const canRemove = canAdjustScore(match, slot, -1).ok;

          return (
            <div
              key={slot}
              className={cn(
                "rounded-2xl border p-4",
                isWinner
                  ? "border-brand-500/60 bg-brand-500/10"
                  : "border-ink-700 bg-ink-850",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-ink-100">
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
                    "tabular shrink-0 text-6xl font-black leading-none sm:text-7xl",
                    match.status === "LIVE" ? "text-live-400" : "text-ink-100",
                  )}
                >
                  {score}
                </p>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  size="xl"
                  variant="primary"
                  fullWidth
                  disabled={!canAdd}
                  onClick={() => handleAdjust(slot, 1)}
                  icon={<Plus className="h-6 w-6" />}
                  className="h-20 text-xl"
                  aria-label={`Cộng 1 điểm cho ${team?.name ?? "đội " + slot}`}
                >
                  1 ĐIỂM
                </Button>
                <Button
                  size="xl"
                  variant="secondary"
                  disabled={!canRemove}
                  onClick={() => handleAdjust(slot, -1)}
                  className="h-20 w-20 shrink-0"
                  aria-label={`Trừ 1 điểm của ${team?.name ?? "đội " + slot}`}
                >
                  <Minus className="h-6 w-6" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p
        className={cn(
          "rounded-xl px-4 py-2.5 text-center text-sm font-medium",
          outcome.isComplete
            ? "bg-brand-500/15 text-brand-400"
            : "bg-ink-800 text-ink-300",
        )}
      >
        {match.status === "FINISHED"
          ? `Kết quả cuối: ${match.score1} - ${match.score2}`
          : describeScoreState(match)}
      </p>

      <div className="flex flex-wrap gap-2">
        {match.status === "SCHEDULED" ? (
          <Button
            size="xl"
            variant="primary"
            fullWidth
            loading={busy}
            onClick={handleStart}
            icon={<Play className="h-5 w-5" />}
          >
            BẮT ĐẦU TRẬN
          </Button>
        ) : null}

        {match.status === "LIVE" ? (
          <>
            <Button
              size="xl"
              variant={finishCheck.ok ? "success" : "secondary"}
              className="flex-1"
              disabled={!finishCheck.ok}
              loading={busy}
              onClick={handleFinish}
              icon={<Flag className="h-5 w-5" />}
            >
              KẾT THÚC TRẬN
            </Button>
            <Button
              size="xl"
              variant="ghost"
              className="h-16 w-16 shrink-0 border border-ink-700"
              onClick={() => setManualOpen(true)}
              aria-label="Nhập tỷ số bằng tay"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </>
        ) : null}

        {match.status === "FINISHED" ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm font-semibold text-brand-400">
            <Check className="h-5 w-5" />
            Trận đã kết thúc — liên hệ BTC nếu cần sửa kết quả.
          </div>
        ) : null}
      </div>

      <ManualScoreDialog
        open={manualOpen}
        match={match}
        onClose={() => setManualOpen(false)}
        onSaved={() => notify("Đã cập nhật tỷ số.", "success")}
      />
    </div>
  );
}
