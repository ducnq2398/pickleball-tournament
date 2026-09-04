"use client";

/**
 * Cài đặt giải: thông tin, luật tính điểm, bảng/sân, phân quyền, nhật ký,
 * và vùng nguy hiểm (xoá dữ liệu).
 */
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  History,
  MapPin,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { AppUser, AuditLog, RankingRuleId, UserRole } from "@/types/tournament";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Field, Input, NumberInput, Select, Toggle } from "@/components/ui/Input";
import { EmptyState, PageLoading } from "@/components/ui/States";
import { useTournament } from "@/hooks/useTournament";
import { useCourts } from "@/hooks/useCourts";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import {
  deleteTournament,
  resetMatches,
  updateTournament,
} from "@/lib/firestore/tournaments";
import { ensureGroups } from "@/lib/firestore/groups";
import { ensureCourts, releaseCourt, updateCourt } from "@/lib/firestore/courts";
import { setUserCourt, setUserRole, watchUsers } from "@/lib/firestore/users";
import { watchAuditLogs } from "@/lib/firestore/auditLogs";
import { RANKING_RULE_LABELS } from "@/lib/tournament/standings";
import { formatTime } from "@/lib/utils";

const ALL_RULES: RankingRuleId[] = ["WINS", "HEAD_TO_HEAD", "SCORE_DIFF", "SCORE_FOR", "MATCH_POINTS"];

export default function AdminSettingsPage() {
  const { tournament, teams, groups, loading, selectTournament } = useTournament();
  const { courts } = useCourts();
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [groupTarget, setGroupTarget] = useState(11);
  const [knockoutTarget, setKnockoutTarget] = useState(15);
  const [winByTwo, setWinByTwo] = useState(true);
  const [playersPerTeam, setPlayersPerTeam] = useState(2);
  const [qualifiers, setQualifiers] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(false);
  const [numberOfGroups, setNumberOfGroups] = useState(2);
  const [numberOfCourts, setNumberOfCourts] = useState(2);
  const [rules, setRules] = useState<RankingRuleId[]>([]);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!tournament) return;
    setName(tournament.name);
    setDate(tournament.date ?? "");
    setLocation(tournament.location ?? "");
    setGroupTarget(tournament.config.groupTargetScore);
    setKnockoutTarget(tournament.config.knockoutTargetScore);
    setWinByTwo(tournament.config.winByTwo);
    setPlayersPerTeam(tournament.config.playersPerTeam);
    setQualifiers(tournament.config.qualifiersPerGroup);
    setThirdPlace(tournament.config.thirdPlaceMatch);
    setNumberOfGroups(tournament.config.numberOfGroups);
    setNumberOfCourts(tournament.config.numberOfCourts);
    setRules(tournament.config.rankingRules);
  }, [tournament]);

  useEffect(() => {
    const unsubscribe = watchUsers(setUsers, () =>
      console.warn("[settings] Không đọc được danh sách người dùng (thiếu quyền?)"),
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!tournament) return;
    const unsubscribe = watchAuditLogs(tournament.id, 30, setLogs, () => undefined);
    return () => unsubscribe();
  }, [tournament]);

  if (loading) return <PageLoading />;
  if (!tournament) return <EmptyState title="Chưa chọn giải đấu" />;

  const moveRule = (index: number, direction: -1 | 1) => {
    const next = [...rules];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRules(next);
  };

  const toggleRule = (rule: RankingRuleId) => {
    setRules((current) =>
      current.includes(rule) ? current.filter((item) => item !== rule) : [...current, rule],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTournament(
        tournament.id,
        {
          name,
          date: date || undefined,
          location: location || undefined,
          config: {
            groupTargetScore: groupTarget,
            knockoutTargetScore: knockoutTarget,
            winByTwo,
            playersPerTeam,
            qualifiersPerGroup: qualifiers,
            thirdPlaceMatch: thirdPlace,
            numberOfGroups,
            numberOfCourts,
            numberOfTeams: teams.length || tournament.config.numberOfTeams,
            rankingRules: rules.length ? rules : tournament.config.rankingRules,
          },
        },
        tournament,
        actor,
      );

      await ensureGroups(tournament.id, numberOfGroups, qualifiers, groups);
      await ensureCourts(tournament.id, numberOfCourts, courts);

      notify("Đã lưu cài đặt giải.", "success");
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await resetMatches(tournament.id, actor);
      notify("Đã xoá toàn bộ trận. Giải trở về trạng thái Nháp.", "success");
      setConfirmReset(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteTournament(tournament.id);
      selectTournament(null);
      notify("Đã xoá giải đấu.", "success");
      setConfirmDelete(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Settings className="h-5 w-5" />}
          title="Thông tin & luật thi đấu"
          action={
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              Lưu cài đặt
            </Button>
          }
        />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="Tên giải">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Ngày thi đấu">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Địa điểm" className="md:col-span-2">
            <Input value={location} onChange={(event) => setLocation(event.target.value)} />
          </Field>

          <Field label="Điểm chạm vòng bảng">
            <NumberInput
              min={1}
              value={groupTarget}
              onChange={(event) => setGroupTarget(Number(event.target.value) || 1)}
            />
          </Field>
          <Field label="Điểm chạm knockout">
            <NumberInput
              min={1}
              value={knockoutTarget}
              onChange={(event) => setKnockoutTarget(Number(event.target.value) || 1)}
            />
          </Field>
          <Field label="Số VĐV mỗi đội">
            <NumberInput
              min={1}
              max={6}
              value={playersPerTeam}
              onChange={(event) => setPlayersPerTeam(Number(event.target.value) || 1)}
            />
          </Field>
          <Field label="Số suất đi tiếp mỗi bảng" hint="Tổng số suất phải là 2, 4, 8 hoặc 16">
            <NumberInput
              min={0}
              value={qualifiers}
              onChange={(event) => setQualifiers(Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="Số bảng">
            <NumberInput
              min={1}
              value={numberOfGroups}
              onChange={(event) => setNumberOfGroups(Number(event.target.value) || 1)}
            />
          </Field>
          <Field label="Số sân">
            <NumberInput
              min={1}
              value={numberOfCourts}
              onChange={(event) => setNumberOfCourts(Number(event.target.value) || 1)}
            />
          </Field>

          <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
            <Toggle
              checked={winByTwo}
              onChange={setWinByTwo}
              label="Phải thắng cách biệt 2 điểm"
              hint="Bật deuce: 11-10 chưa kết thúc, phải 12-10."
            />
            <Toggle
              checked={thirdPlace}
              onChange={setThirdPlace}
              label="Có trận tranh hạng 3"
              hint="Áp dụng khi tạo lại nhánh knockout."
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Luật xếp hạng"
          description="Kéo thứ tự ưu tiên — áp dụng ngay cho bảng xếp hạng (tính lại từ kết quả trận)."
        />
        <CardBody className="space-y-2">
          {rules.map((rule, index) => (
            <div
              key={rule}
              className="flex items-center gap-2 rounded-lg border border-line/70 bg-subtle/50 px-3 py-2"
            >
              <span className="tabular w-6 text-sm font-bold text-faint">{index + 1}</span>
              <span className="flex-1 text-sm font-medium text-strong">
                {RANKING_RULE_LABELS[rule]}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => moveRule(index, -1)}
                disabled={index === 0}
                aria-label="Lên"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => moveRule(index, 1)}
                disabled={index === rules.length - 1}
                aria-label="Xuống"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-live-400"
                onClick={() => toggleRule(rule)}
                aria-label="Bỏ tiêu chí"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {ALL_RULES.filter((rule) => !rules.includes(rule)).map((rule) => (
              <Button key={rule} variant="ghost" size="sm" className="border border-line" onClick={() => toggleRule(rule)}>
                + {RANKING_RULE_LABELS[rule]}
              </Button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<MapPin className="h-5 w-5" />} title="Sân thi đấu" description={`${courts.length} sân`} />
        <CardBody className="grid gap-2 sm:grid-cols-2">
          {courts.map((court) => (
            <div
              key={court.id}
              className="flex items-center gap-2 rounded-lg border border-line/70 bg-subtle/50 px-3 py-2"
            >
              <Input
                defaultValue={court.name}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value && value !== court.name) {
                    void updateCourt(tournament.id, court.id, { name: value }).catch(notifyError);
                  }
                }}
                className="h-8 flex-1"
              />
              <Badge tone={court.currentMatchId ? "live" : "neutral"}>
                {court.currentMatchId ? "Đang dùng" : "Trống"}
              </Badge>
              {court.currentMatchId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="border border-line text-xs"
                  onClick={() => void releaseCourt(tournament.id, court.id).catch(notifyError)}
                >
                  Giải phóng
                </Button>
              ) : null}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Phân quyền"
          description="ADMIN toàn quyền · REFEREE chỉ nhập điểm trên sân được giao."
        />
        <CardBody>
          {users.length === 0 ? (
            <p className="py-3 text-sm text-faint">
              Chưa có người dùng nào. Người dùng xuất hiện ở đây sau lần đăng nhập đầu tiên.
            </p>
          ) : (
            <ul className="space-y-2">
              {users.map((user) => (
                <li
                  key={user.id}
                  // Điện thoại: tên một dòng, hai ô chọn xuống dòng dưới — để cùng
                  // hàng thì 2 select 128px bóp tên người dùng còn đúng một chữ.
                  className="flex flex-col gap-2 rounded-lg border border-line/70 bg-subtle/50 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center"
                >
                  <div className="min-w-0 sm:flex-1">
                    <p className="truncate text-sm font-semibold text-strong">{user.name}</p>
                    <p className="truncate text-xs text-mute">{user.email ?? user.id}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
                  <Select
                    aria-label={`Vai trò của ${user.name}`}
                    className="h-8 py-0 text-xs sm:w-32"
                    value={user.role}
                    onChange={(event) =>
                      void setUserRole(user.id, event.target.value as UserRole).catch(notifyError)
                    }
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="REFEREE">REFEREE</option>
                  </Select>
                  <Select
                    aria-label={`Sân của ${user.name}`}
                    className="h-8 py-0 text-xs sm:w-32"
                    value={user.courtId ?? ""}
                    onChange={(event) =>
                      void setUserCourt(user.id, event.target.value || undefined).catch(notifyError)
                    }
                  >
                    <option value="">Không gán sân</option>
                    {courts.map((court) => (
                      <option key={court.id} value={court.id}>
                        {court.name}
                      </option>
                    ))}
                  </Select>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<History className="h-5 w-5" />}
          title="Nhật ký thao tác"
          description="Ai đã sửa điểm, mở lại trận, tạo knockout..."
        />
        <CardBody>
          {logs.length === 0 ? (
            <p className="py-3 text-sm text-faint">Chưa có thao tác nào được ghi nhận.</p>
          ) : (
            <ul className="space-y-1.5">
              {logs.map((log) => (
                <li key={log.id} className="flex gap-3 rounded-lg bg-subtle/40 px-3 py-2 text-sm">
                  <span className="tabular w-14 shrink-0 text-xs text-faint">
                    {log.createdAt ? formatTime(new Date(log.createdAt).toISOString()) : "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body">
                    {log.message ?? log.action}
                  </span>
                  <span className="shrink-0 text-xs text-faint">{log.userName ?? "Hệ thống"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="border-live-500/40">
        <CardHeader
          icon={<TriangleAlert className="h-5 w-5 text-live-400" />}
          title="Vùng nguy hiểm"
          description="Các thao tác không thể hoàn tác."
        />
        <CardBody className="flex flex-wrap gap-2">
          <Button variant="warning" onClick={() => setConfirmReset(true)}>
            Xoá toàn bộ trận đấu
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" />}>
            Xoá giải đấu
          </Button>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        title="Xoá toàn bộ trận đấu?"
        danger
        message="Tất cả trận (kể cả kết quả đã nhập) sẽ bị xoá. Đội và bảng đấu được giữ nguyên."
        warnings={["Bảng xếp hạng sẽ về 0.", "Giải chuyển về trạng thái Nháp."]}
        confirmLabel="Xoá trận đấu"
        loading={saving}
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Xoá giải "${tournament.name}"?`}
        danger
        message="Toàn bộ đội, bảng, trận, sân và nhật ký của giải sẽ bị xoá vĩnh viễn."
        confirmLabel="Xoá vĩnh viễn"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
