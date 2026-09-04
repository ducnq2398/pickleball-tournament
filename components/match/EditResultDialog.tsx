"use client";

/**
 * Sửa kết quả một trận ĐÃ KẾT THÚC (§29).
 *
 * Nếu đội thắng thay đổi và đây là trận knockout, các trận phía sau sẽ được đặt
 * lại và ghép đội mới — không bao giờ để nhánh knockout sai đội.
 */
import { useEffect, useState } from "react";
import type { Match } from "@/types/tournament";
import { evaluateMatch, isValidScore } from "@/lib/tournament/scoring";
import { isKnockoutStage } from "@/lib/tournament/knockout";
import { editFinishedScore } from "@/lib/firestore/matches";
import { refreshBracketAfterResult } from "@/lib/firestore/knockout";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, NumberInput } from "@/components/ui/Input";
import { ValidationList } from "@/components/ui/States";

export function EditResultDialog({
  open,
  match,
  onClose,
}: {
  open: boolean;
  match: Match;
  onClose: () => void;
}) {
  const { tournament, teams, groups, matches } = useTournamentContext();
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();

  const [score1, setScore1] = useState(match.score1);
  const [score2, setScore2] = useState(match.score2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setScore1(match.score1);
      setScore2(match.score2);
    }
  }, [open, match.score1, match.score2]);

  const rules = { targetScore: match.targetScore, winByTwo: match.winByTwo };
  const validation = isValidScore(score1, score2, rules);
  const outcome = evaluateMatch({ ...match, score1, score2 });
  const canSave = validation.ok && outcome.isComplete;

  const teamName = (teamId?: string) => teams.find((t) => t.id === teamId)?.name ?? "Đội";
  const winnerChanged = outcome.winnerId !== match.winnerId;

  const handleSave = async () => {
    if (!tournament || !canSave) return;
    setSaving(true);
    try {
      const updated = await editFinishedScore(tournament.id, match.id, score1, score2, actor);
      notify(`Đã sửa kết quả trận #${match.code}.`, "success");

      if (matches.some((m) => isKnockoutStage(m.stage))) {
        const patched = matches.map((m) => (m.id === updated.id ? updated : m));
        await refreshBracketAfterResult(
          tournament,
          groups,
          teams,
          patched,
          updated.id,
          { resetDependents: winnerChanged },
          actor,
        );
      }
      onClose();
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Sửa kết quả trận #${match.code}`}
      description={`Tỷ số mới vẫn phải là một kết quả hợp lệ (chạm ${match.targetScore}${match.winByTwo ? ", hơn 2 điểm" : ""}).`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={!canSave}>
            Lưu kết quả
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={teamName(match.team1Id)}>
          <NumberInput
            min={0}
            value={score1}
            onChange={(event) => setScore1(Math.max(0, Number(event.target.value) || 0))}
            className="h-14 text-2xl"
          />
        </Field>
        <Field label={teamName(match.team2Id)}>
          <NumberInput
            min={0}
            value={score2}
            onChange={(event) => setScore2(Math.max(0, Number(event.target.value) || 0))}
            className="h-14 text-2xl"
          />
        </Field>

        <ValidationList
          errors={validation.ok ? (outcome.isComplete ? [] : [outcome.reason]) : validation.errors}
          warnings={
            canSave && winnerChanged
              ? [
                  `Đội thắng đổi thành ${teamName(outcome.winnerId)}. ` +
                    (isKnockoutStage(match.stage)
                      ? "Các trận knockout phía sau sẽ được đặt lại."
                      : "Bảng xếp hạng sẽ được tính lại."),
                ]
              : []
          }
        />
      </div>
    </Modal>
  );
}
