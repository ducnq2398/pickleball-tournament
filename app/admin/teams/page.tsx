"use client";

/**
 * Quản lý đội: thêm / sửa / xoá / nhập hàng loạt.
 * Xoá đội đã thi đấu bắt buộc phải xác nhận mạnh (§19).
 */
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import type { Team } from "@/types/tournament";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Input";
import { EmptyState, PageLoading, ValidationList } from "@/components/ui/States";
import { useTournament } from "@/hooks/useTournament";
import { useMatches } from "@/hooks/useMatches";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { countTeamMatches, createTeam, createTeams, deleteTeam, updateTeam } from "@/lib/firestore/teams";
import { canDeleteTeam, validateTeamInput } from "@/lib/tournament/validation";

export default function AdminTeamsPage() {
  const { tournament, teams, groups, loading } = useTournament();
  const { matches } = useMatches();
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();

  const playersPerTeam = tournament?.config.playersPerTeam ?? 2;

  const [editing, setEditing] = useState<Team | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [working, setWorking] = useState(false);

  const [name, setName] = useState("");
  const [playerNames, setPlayerNames] = useState<string[]>(Array(playersPerTeam).fill(""));
  const [note, setNote] = useState("");
  const [bulkText, setBulkText] = useState("");

  const groupNameById = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups],
  );

  const resetForm = () => {
    setName("");
    setPlayerNames(Array(playersPerTeam).fill(""));
    setNote("");
  };

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (team: Team) => {
    setName(team.name);
    setPlayerNames(
      Array.from({ length: playersPerTeam }, (_, index) => team.players[index]?.name ?? ""),
    );
    setNote(team.note ?? "");
    setEditing(team);
    setCreating(false);
  };

  const validation = validateTeamInput(name, playerNames, teams, editing?.id);

  const handleSave = async () => {
    if (!tournament || !validation.ok) return;
    setWorking(true);
    try {
      if (editing) {
        await updateTeam(tournament.id, editing, { name, playerNames, note }, teams, actor);
        notify("Đã cập nhật đội.", "success");
      } else {
        await createTeam(tournament.id, { name, playerNames, note }, teams, actor);
        notify("Đã thêm đội.", "success");
      }
      setEditing(null);
      setCreating(false);
      resetForm();
    } catch (error) {
      notifyError(error);
    } finally {
      setWorking(false);
    }
  };

  const handleBulk = async () => {
    if (!tournament) return;
    const lines = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setWorking(true);
    try {
      const inputs = lines.map((line) => {
        // Định dạng: "Tên đội | VĐV 1, VĐV 2"
        const [teamName, players = ""] = line.split("|").map((part) => part.trim());
        return {
          name: teamName,
          playerNames: players
            .split(",")
            .map((player) => player.trim())
            .filter(Boolean),
        };
      });
      await createTeams(tournament.id, inputs, actor);
      notify(`Đã thêm ${inputs.length} đội.`, "success");
      setBulkText("");
      setBulkOpen(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!tournament || !deleting) return;
    setWorking(true);
    try {
      await deleteTeam(tournament.id, deleting, actor);
      notify(`Đã xoá đội ${deleting.name}.`, "success");
      setDeleting(null);
    } catch (error) {
      notifyError(error);
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <PageLoading />;
  if (!tournament) return <EmptyState title="Chưa chọn giải đấu" />;

  const deleteInfo = deleting ? countTeamMatches(deleting.id, matches) : null;
  const deleteCheck = deleting ? canDeleteTeam(deleting.id, matches) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Users className="h-5 w-5" />}
          title="Danh sách đội"
          description={`${teams.length}/${tournament.config.numberOfTeams} đội · ${playersPerTeam} VĐV mỗi đội`}
          action={
            <>
              <Button variant="ghost" size="sm" className="border border-line" onClick={() => setBulkOpen(true)} icon={<Upload className="h-4 w-4" />}>
                Nhập nhanh
              </Button>
              <Button variant="primary" size="sm" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                Thêm đội
              </Button>
            </>
          }
        />
        <CardBody>
          {teams.length === 0 ? (
            <EmptyState
              title="Chưa có đội nào"
              description="Thêm từng đội hoặc dùng chức năng nhập nhanh nhiều đội cùng lúc."
              action={
                <Button variant="primary" onClick={openCreate}>
                  Thêm đội đầu tiên
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {teams.map((team, index) => {
                const info = countTeamMatches(team.id, matches);
                return (
                  <li
                    key={team.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-line/70 bg-subtle/40 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="tabular text-xs font-bold text-faint">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate font-semibold text-strong">{team.name}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-mute">
                        {team.players.length
                          ? team.players.map((player) => player.name).join(" · ")
                          : "Chưa có VĐV"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {team.groupId ? (
                          <Badge tone="info">{groupNameById.get(team.groupId) ?? "Bảng"}</Badge>
                        ) : (
                          <Badge tone="warning">Chưa xếp bảng</Badge>
                        )}
                        {info.total > 0 ? (
                          <span className="text-xs text-faint">
                            {info.played}/{info.total} trận đã đấu
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openEdit(team)}
                        aria-label={`Sửa ${team.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-live-400"
                        onClick={() => setDeleting(team)}
                        aria-label={`Xoá ${team.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={creating || !!editing}
        title={editing ? `Sửa đội ${editing.name}` : "Thêm đội mới"}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Huỷ
            </Button>
            <Button variant="primary" onClick={handleSave} loading={working} disabled={!validation.ok}>
              {editing ? "Lưu thay đổi" : "Thêm đội"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Tên đội">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="VD: Sài Gòn Smash"
              autoFocus
            />
          </Field>
          {playerNames.map((player, index) => (
            <Field key={index} label={`Vận động viên ${index + 1}`}>
              <Input
                value={player}
                onChange={(event) => {
                  const next = [...playerNames];
                  next[index] = event.target.value;
                  setPlayerNames(next);
                }}
                placeholder="Họ và tên"
              />
            </Field>
          ))}
          <Field label="Ghi chú" hint="CLB, số điện thoại liên hệ...">
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <ValidationList errors={validation.errors} warnings={validation.warnings} />
        </div>
      </Modal>

      <Modal
        open={bulkOpen}
        title="Nhập nhanh nhiều đội"
        description="Mỗi dòng một đội, theo mẫu: Tên đội | VĐV 1, VĐV 2"
        onClose={() => setBulkOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>
              Huỷ
            </Button>
            <Button variant="primary" onClick={handleBulk} loading={working} disabled={!bulkText.trim()}>
              Thêm tất cả
            </Button>
          </>
        }
      >
        <textarea
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
          rows={9}
          placeholder={"Sài Gòn Smash | Nguyễn Văn A, Trần Văn B\nHà Nội Dinker | Lê Văn C, Phạm Văn D"}
          className="w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 font-mono text-sm text-strong placeholder:text-faint focus:border-brand-500 focus:outline-none"
        />
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={`Xoá đội ${deleting?.name ?? ""}?`}
        danger
        message={
          deleteInfo && deleteInfo.played > 0
            ? "Đội này đã có dữ liệu thi đấu. Bạn có chắc chắn muốn xoá?"
            : "Đội sẽ bị xoá khỏi giải cùng các trận liên quan."
        }
        warnings={deleteCheck?.warnings}
        confirmLabel="Xoá đội"
        loading={working}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
