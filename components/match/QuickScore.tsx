"use client";

/**
 * Nhập điểm nhanh cho Admin ngay trên dashboard (§54).
 * Vẫn dùng đúng transaction + luật như màn hình trọng tài.
 */
import { useRef, useState } from "react";
import { Flag, Minus, Play, Plus } from "lucide-react";
import type { Match } from "@/types/tournament";
import { canAdjustScore, canFinishMatch } from "@/lib/tournament/scoring";
import { isKnockoutStage } from "@/lib/tournament/knockout";
import { adjustScore, finishMatch, startMatch } from "@/lib/firestore/matches";
import { refreshBracketAfterResult } from "@/lib/firestore/knockout";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";

export function QuickScore({ match }: { match: Match }) {
  const { tournament, teams, groups, matches } = useTournamentContext();
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();
  const [busy, setBusy] = useState(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = (task: () => Promise<void>) => {
    setBusy(true);
    queueRef.current = queueRef.current
      .then(task)
      .catch((error) => notifyError(error))
      .finally(() => setBusy(false));
  };

  const handleAdjust = (slot: 1 | 2, delta: number) => {
    if (!tournament) return;
    const check = canAdjustScore(match, slot, delta);
    if (!check.ok) {
      notify(check.errors[0], "warning");
      return;
    }
    enqueue(async () => {
      await adjustScore(tournament.id, match, slot, delta, actor);
    });
  };

  const handleFinish = () => {
    if (!tournament) return;
    const check = canFinishMatch(match);
    if (!check.ok) {
      notify(check.errors[0], "warning");
      return;
    }
    enqueue(async () => {
      const finished = await finishMatch(tournament.id, match, actor);
      notify(`Trận #${finished.code} kết thúc ${finished.score1} - ${finished.score2}.`, "success");
      if (matches.some((m) => isKnockoutStage(m.stage))) {
        const updated = matches.map((m) => (m.id === finished.id ? finished : m));
        await refreshBracketAfterResult(tournament, groups, teams, updated, finished.id, {}, actor);
      }
    });
  };

  const handleStart = () => {
    if (!tournament) return;
    enqueue(async () => {
      await startMatch(tournament.id, match, matches, actor);
    });
  };

  if (match.status === "SCHEDULED") {
    return (
      <Button
        variant="primary"
        size="sm"
        loading={busy}
        onClick={handleStart}
        icon={<Play className="h-3.5 w-3.5" />}
      >
        Bắt đầu
      </Button>
    );
  }

  if (match.status !== "LIVE") return null;

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {([1, 2] as const).map((slot) => (
        <div key={slot} className="flex items-center gap-1 rounded-lg bg-ink-800 p-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!canAdjustScore(match, slot, -1).ok}
            onClick={() => handleAdjust(slot, -1)}
            aria-label={`Trừ điểm đội ${slot}`}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="tabular w-8 text-center text-sm font-bold text-ink-100">
            {slot === 1 ? match.score1 : match.score2}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-brand-400"
            disabled={!canAdjustScore(match, slot, 1).ok}
            onClick={() => handleAdjust(slot, 1)}
            aria-label={`Cộng điểm đội ${slot}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant={canFinishMatch(match).ok ? "success" : "secondary"}
        size="sm"
        disabled={!canFinishMatch(match).ok}
        loading={busy}
        onClick={handleFinish}
        icon={<Flag className="h-3.5 w-3.5" />}
      >
        Kết thúc
      </Button>
    </div>
  );
}
