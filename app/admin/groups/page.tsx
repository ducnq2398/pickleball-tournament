"use client";

/**
 * Chia bảng: tự động phân bổ, kéo–thả giữa các bảng (desktop) hoặc chọn bảng
 * từ danh sách (mobile). Chỉ ghi Firestore khi bấm Lưu.
 */
import { useEffect, useMemo, useState } from "react";
import { GripVertical, RotateCcw, Save, Shuffle, Rows3 } from "lucide-react";
import type { Team } from "@/types/tournament";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, NumberInput, Select } from "@/components/ui/Input";
import { EmptyState, PageLoading, ValidationList } from "@/components/ui/States";
import { useTournament } from "@/hooks/useTournament";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import {
  assignmentsEqual,
  autoDistribute,
  moveTeamBetweenGroups,
  saveGroupAssignments,
  updateGroup,
  type GroupAssignment,
} from "@/lib/firestore/groups";
import { validateGroupSetup } from "@/lib/tournament/validation";
import { cn } from "@/lib/utils";

const UNASSIGNED = "__unassigned__";

export default function AdminGroupsPage() {
  const { tournament, teams, groups, loading } = useTournament();
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();

  const [assignments, setAssignments] = useState<GroupAssignment[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const serverAssignments = useMemo<GroupAssignment[]>(
    () => groups.map((group) => ({ groupId: group.id, teamIds: group.teamIds })),
    [groups],
  );

  useEffect(() => {
    setAssignments(serverAssignments);
  }, [serverAssignments]);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const assignedIds = new Set(assignments.flatMap((a) => a.teamIds));
  const unassigned = teams.filter((team) => !assignedIds.has(team.id));
  const dirty = !assignmentsEqual(assignments, serverAssignments);

  const previewGroups = groups.map((group) => ({
    ...group,
    teamIds: assignments.find((a) => a.groupId === group.id)?.teamIds ?? [],
  }));
  const validation = validateGroupSetup(previewGroups, teams);

  const handleMove = (teamId: string, targetGroupId: string) => {
    if (targetGroupId === UNASSIGNED) {
      setAssignments((current) =>
        current.map((item) => ({ ...item, teamIds: item.teamIds.filter((id) => id !== teamId) })),
      );
      return;
    }
    setAssignments((current) => moveTeamBetweenGroups(current, teamId, targetGroupId));
  };

  const handleAuto = () => {
    setAssignments(autoDistribute(teams, groups));
    notify("Đã chia bảng tự động. Kiểm tra rồi bấm Lưu.", "info");
  };

  const handleSave = async () => {
    if (!tournament) return;
    setSaving(true);
    try {
      await saveGroupAssignments(tournament.id, assignments, groups, teams, actor);
      notify("Đã lưu chia bảng.", "success");
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleSlots = async (groupId: string, value: number) => {
    if (!tournament) return;
    try {
      await updateGroup(tournament.id, groupId, { qualificationSlots: Math.max(0, value) });
    } catch (error) {
      notifyError(error);
    }
  };

  if (loading) return <PageLoading />;
  if (!tournament) return <EmptyState title="Chưa chọn giải đấu" />;

  const renderTeamRow = (team: Team, currentGroupId: string) => (
    <li
      key={team.id}
      draggable
      onDragStart={() => setDragging(team.id)}
      onDragEnd={() => setDragging(null)}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-ink-700/60 bg-ink-800/60 px-2.5 py-2",
        dragging === team.id && "opacity-50",
      )}
    >
      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-100">{team.name}</p>
        <p className="truncate text-xs text-ink-400">
          {team.players.map((player) => player.name).join(" · ") || "Chưa có VĐV"}
        </p>
      </div>
      <Select
        aria-label={`Chuyển ${team.name} sang bảng khác`}
        className="h-8 w-28 shrink-0 py-0 text-xs"
        value={currentGroupId}
        onChange={(event) => handleMove(team.id, event.target.value)}
      >
        <option value={UNASSIGNED}>Chưa xếp</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </Select>
    </li>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Rows3 className="h-5 w-5" />}
          title="Chia bảng"
          description={`${teams.length} đội · ${groups.length} bảng · kéo thả hoặc chọn bảng để chuyển đội`}
          action={
            <>
              <Button variant="ghost" size="sm" className="border border-ink-700" onClick={handleAuto} icon={<Shuffle className="h-4 w-4" />}>
                Chia tự động
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="border border-ink-700"
                onClick={() => setAssignments(serverAssignments)}
                disabled={!dirty}
                icon={<RotateCcw className="h-4 w-4" />}
              >
                Hoàn tác
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={!dirty || !validation.ok}
                icon={<Save className="h-4 w-4" />}
              >
                Lưu
              </Button>
            </>
          }
        />
        <CardBody className="space-y-3">
          {dirty ? (
            <p className="rounded-lg border border-warn-500/40 bg-warn-500/10 px-3 py-2 text-sm text-warn-400">
              Có thay đổi chưa lưu.
            </p>
          ) : null}
          <ValidationList errors={validation.errors} warnings={validation.warnings} />
        </CardBody>
      </Card>

      {groups.length === 0 ? (
        <EmptyState
          title="Chưa có bảng đấu"
          description="Tạo bảng trong phần Cài đặt giải (số bảng)."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const teamIds = assignments.find((a) => a.groupId === group.id)?.teamIds ?? [];
            return (
              <Card
                key={group.id}
                className="transition-colors"
                as="section"
              >
                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging) handleMove(dragging, group.id);
                    setDragging(null);
                  }}
                >
                  <CardHeader
                    title={group.name}
                    description={`${teamIds.length} đội`}
                    action={<Badge tone="success">{group.qualificationSlots} suất đi tiếp</Badge>}
                  />
                  <CardBody className="space-y-3">
                    <ul className="min-h-[6rem] space-y-2">
                      {teamIds.length === 0 ? (
                        <li className="rounded-lg border border-dashed border-ink-600 px-3 py-6 text-center text-sm text-ink-500">
                          Kéo đội vào đây
                        </li>
                      ) : (
                        teamIds.map((teamId) => {
                          const team = teamById.get(teamId);
                          return team ? renderTeamRow(team, group.id) : null;
                        })
                      )}
                    </ul>
                    <Field label="Số suất đi tiếp">
                      <NumberInput
                        min={0}
                        max={teamIds.length}
                        defaultValue={group.qualificationSlots}
                        onBlur={(event) => void handleSlots(group.id, Number(event.target.value))}
                        className="h-9"
                      />
                    </Field>
                  </CardBody>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 ? (
        <Card>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging) handleMove(dragging, UNASSIGNED);
              setDragging(null);
            }}
          >
            <CardHeader
              title="Đội chưa xếp bảng"
              description={`${unassigned.length} đội`}
            />
            <CardBody>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {unassigned.map((team) => renderTeamRow(team, UNASSIGNED))}
              </ul>
            </CardBody>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
