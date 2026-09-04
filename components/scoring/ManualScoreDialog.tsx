"use client";

/**
 * Nhập thẳng tỷ số (khi trọng tài bấm nhầm hoặc nhập bù cho một hiệp đã đấu).
 * Vẫn phải qua đúng bộ luật ở lib/tournament/scoring.
 */
import { useEffect, useState } from "react";
import type { Match } from "@/types/tournament";
import { isValidScore } from "@/lib/tournament/scoring";
import { setScore } from "@/lib/firestore/matches";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, NumberInput } from "@/components/ui/Input";
import { ValidationList } from "@/components/ui/States";

export function ManualScoreDialog({
  open,
  match,
  onClose,
  onSaved,
}: {
  open: boolean;
  match: Match;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { tournament, teams } = useTournamentContext();
  const { actor } = useAuth();
  const { notifyError } = useToast();

  const [score1, setScore1] = useState(match.score1);
  const [score2, setScore2] = useState(match.score2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setScore1(match.score1);
      setScore2(match.score2);
    }
  }, [open, match.score1, match.score2]);

  const validation = isValidScore(score1, score2, {
    targetScore: match.targetScore,
    winByTwo: match.winByTwo,
  });

  const handleSave = async () => {
    if (!tournament || !validation.ok) return;
    setSaving(true);
    try {
      await setScore(tournament.id, match.id, score1, score2, actor);
      onSaved?.();
      onClose();
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  };

  const name = (teamId?: string) => teams.find((t) => t.id === teamId)?.name ?? "Đội";

  return (
    <Modal
      open={open}
      title={`Nhập tỷ số trận #${match.code}`}
      description={`Trận chạm ${match.targetScore}${match.winByTwo ? ", thắng cách biệt 2 điểm" : ""}.`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={!validation.ok}>
            Lưu tỷ số
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={name(match.team1Id)}>
          <NumberInput
            min={0}
            value={score1}
            onChange={(event) => setScore1(Math.max(0, Number(event.target.value) || 0))}
            className="h-14 text-2xl"
          />
        </Field>
        <Field label={name(match.team2Id)}>
          <NumberInput
            min={0}
            value={score2}
            onChange={(event) => setScore2(Math.max(0, Number(event.target.value) || 0))}
            className="h-14 text-2xl"
          />
        </Field>
        <ValidationList errors={validation.errors} />
      </div>
    </Modal>
  );
}
