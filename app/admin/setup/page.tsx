"use client";

/**
 * WIZARD TẠO GIẢI (§50) — 6 bước, có review trước khi tạo.
 * Mọi dữ liệu chỉ được ghi Firestore ở bước cuối cùng.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, StatTile } from "@/components/ui/Card";
import { Field, Input, NumberInput, Select, Toggle } from "@/components/ui/Input";
import { ValidationList } from "@/components/ui/States";
import { useTournament } from "@/hooks/useTournament";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { createTournamentWithData } from "@/lib/firestore/bootstrap";
import { seedSampleTournament } from "@/lib/firestore/seed";
import {
  createTournamentConfig,
  distributeTeams,
  groupDisplayName,
} from "@/lib/tournament/tournament";
import { countRoundRobinMatches } from "@/lib/tournament/schedule";
import { validateKnockoutPlan } from "@/lib/tournament/knockout";
import { cn } from "@/lib/utils";

const STEPS = [
  "Thông tin giải",
  "Quy mô & luật",
  "Nhập đội",
  "Chia bảng",
  "Lịch thi đấu",
  "Xác nhận",
];

interface TeamDraft {
  name: string;
  playerNames: string[];
}

export default function SetupWizardPage() {
  const router = useRouter();
  const { selectTournament } = useTournament();
  const { actor } = useAuth();
  const { notify, notifyError } = useToast();

  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState(`Giải Pickleball ${new Date().getFullYear()}`);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");

  const [numberOfTeams, setNumberOfTeams] = useState(9);
  const [numberOfGroups, setNumberOfGroups] = useState(2);
  const [numberOfCourts, setNumberOfCourts] = useState(2);
  const [groupTarget, setGroupTarget] = useState(11);
  const [knockoutTarget, setKnockoutTarget] = useState(15);
  const [winByTwo, setWinByTwo] = useState(true);
  const [playersPerTeam, setPlayersPerTeam] = useState(2);
  const [qualifiers, setQualifiers] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(false);

  const [teams, setTeams] = useState<TeamDraft[]>(() =>
    Array.from({ length: 9 }, (_, index) => ({
      name: `Đội ${index + 1}`,
      playerNames: ["", ""],
    })),
  );
  const [distribution, setDistribution] = useState<number[][] | null>(null);

  const syncTeamCount = (count: number) => {
    setNumberOfTeams(count);
    setTeams((current) => {
      if (count <= current.length) return current.slice(0, count);
      return [
        ...current,
        ...Array.from({ length: count - current.length }, (_, index) => ({
          name: `Đội ${current.length + index + 1}`,
          playerNames: Array(playersPerTeam).fill(""),
        })),
      ];
    });
    setDistribution(null);
  };

  const effectiveDistribution = useMemo(() => {
    if (distribution) return distribution;
    return distributeTeams(
      teams.map((_, index) => String(index)),
      numberOfGroups,
    ).map((bucket) => bucket.map((value) => Number(value)));
  }, [distribution, teams, numberOfGroups]);

  const groupSizes = effectiveDistribution.map((bucket) => bucket.length);
  const totalMatches = groupSizes.reduce((sum, size) => sum + countRoundRobinMatches(size), 0);

  const knockoutCheck = validateKnockoutPlan(
    Array.from({ length: numberOfGroups }, (_, index) => ({
      id: `g${index}`,
      name: groupDisplayName(index),
      order: index,
      qualificationSlots: qualifiers,
    })),
  );

  const errors: string[] = [];
  if (step === 0 && !name.trim()) errors.push("Tên giải không được để trống.");
  if (step === 2) {
    const filled = teams.filter((team) => team.name.trim());
    if (filled.length < 2) errors.push("Cần ít nhất 2 đội.");
    const duplicated = new Set<string>();
    const seen = new Set<string>();
    for (const team of filled) {
      const key = team.name.trim().toLowerCase();
      if (seen.has(key)) duplicated.add(team.name.trim());
      seen.add(key);
    }
    if (duplicated.size) errors.push(`Trùng tên đội: ${[...duplicated].join(", ")}.`);
  }
  if (step === 3 && groupSizes.some((size) => size < 2)) {
    errors.push("Mỗi bảng cần ít nhất 2 đội.");
  }

  const warnings: string[] = [];
  if (step === 1 && !knockoutCheck.ok) warnings.push(...knockoutCheck.errors);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createTournamentWithData(
        {
          name,
          date,
          location,
          config: createTournamentConfig({
            numberOfTeams: teams.length,
            numberOfGroups,
            numberOfCourts,
            groupTargetScore: groupTarget,
            knockoutTargetScore: knockoutTarget,
            winByTwo,
            playersPerTeam,
            qualifiersPerGroup: qualifiers,
            thirdPlaceMatch: thirdPlace,
          }),
          teams: teams
            .filter((team) => team.name.trim())
            .map((team) => ({ name: team.name, playerNames: team.playerNames })),
          distribution: effectiveDistribution,
          generateSchedule: true,
          startImmediately: true,
        },
        actor,
      );
      selectTournament(result.tournamentId);
      notify(
        `Đã tạo giải với ${result.teamCount} đội và ${result.matchCount} trận vòng bảng.`,
        "success",
      );
      router.push("/admin");
    } catch (error) {
      notifyError(error);
    } finally {
      setCreating(false);
    }
  };

  const handleSeed = async () => {
    setCreating(true);
    try {
      const id = await seedSampleTournament({}, actor);
      selectTournament(id);
      notify("Đã tạo giải mẫu.", "success");
      router.push("/admin");
    } catch (error) {
      notifyError(error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Wand2 className="h-5 w-5" />}
          title="Tạo giải mới"
          description={`Bước ${step + 1}/${STEPS.length}: ${STEPS[step]}`}
          action={
            <Button variant="ghost" size="sm" className="border border-line" onClick={handleSeed} loading={creating} icon={<Sparkles className="h-4 w-4" />}>
              Dùng giải mẫu
            </Button>
          }
        />
        <CardBody>
          <ol className="flex flex-wrap gap-1.5">
            {STEPS.map((label, index) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
                  index === step
                    ? "bg-brand-500 text-white"
                    : index < step
                      ? "bg-brand-500/15 text-brand-400"
                      : "bg-subtle text-mute",
                )}
              >
                {index < step ? <Check className="h-3 w-3" /> : <span>{index + 1}</span>}
                {label}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          {step === 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tên giải" className="md:col-span-2">
                <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
              </Field>
              <Field label="Ngày thi đấu">
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
              <Field label="Địa điểm">
                <Input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="VD: Nhà thi đấu Quận 7"
                />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Số đội">
                <NumberInput
                  min={2}
                  value={numberOfTeams}
                  onChange={(event) => syncTeamCount(Math.max(2, Number(event.target.value) || 2))}
                />
              </Field>
              <Field label="Số bảng">
                <NumberInput
                  min={1}
                  value={numberOfGroups}
                  onChange={(event) => {
                    setNumberOfGroups(Math.max(1, Number(event.target.value) || 1));
                    setDistribution(null);
                  }}
                />
              </Field>
              <Field label="Số sân">
                <NumberInput
                  min={1}
                  value={numberOfCourts}
                  onChange={(event) => setNumberOfCourts(Math.max(1, Number(event.target.value) || 1))}
                />
              </Field>
              <Field label="Điểm chạm vòng bảng">
                <NumberInput
                  min={1}
                  value={groupTarget}
                  onChange={(event) => setGroupTarget(Number(event.target.value) || 11)}
                />
              </Field>
              <Field label="Điểm chạm knockout">
                <NumberInput
                  min={1}
                  value={knockoutTarget}
                  onChange={(event) => setKnockoutTarget(Number(event.target.value) || 15)}
                />
              </Field>
              <Field label="Số VĐV mỗi đội">
                <NumberInput
                  min={1}
                  max={6}
                  value={playersPerTeam}
                  onChange={(event) => setPlayersPerTeam(Math.max(1, Number(event.target.value) || 2))}
                />
              </Field>
              <Field label="Số suất đi tiếp mỗi bảng" hint="Tổng số suất phải là 2, 4, 8 hoặc 16">
                <NumberInput
                  min={0}
                  value={qualifiers}
                  onChange={(event) => setQualifiers(Math.max(0, Number(event.target.value) || 0))}
                />
              </Field>
              <div className="md:col-span-2 space-y-3">
                <Toggle
                  checked={winByTwo}
                  onChange={setWinByTwo}
                  label="Phải thắng cách biệt 2 điểm"
                  hint="11-10 chưa kết thúc, phải 12-10."
                />
                <Toggle
                  checked={thirdPlace}
                  onChange={setThirdPlace}
                  label="Có trận tranh hạng 3"
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              {teams.map((team, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-xl border border-line/70 bg-subtle/40 p-3 sm:grid-cols-[1fr_2fr]"
                >
                  <Input
                    value={team.name}
                    onChange={(event) => {
                      const next = [...teams];
                      next[index] = { ...team, name: event.target.value };
                      setTeams(next);
                    }}
                    placeholder={`Tên đội ${index + 1}`}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: playersPerTeam }).map((_, playerIndex) => (
                      <Input
                        key={playerIndex}
                        value={team.playerNames[playerIndex] ?? ""}
                        onChange={(event) => {
                          const next = [...teams];
                          const players = [...team.playerNames];
                          players[playerIndex] = event.target.value;
                          next[index] = { ...team, playerNames: players };
                          setTeams(next);
                        }}
                        placeholder={`VĐV ${playerIndex + 1}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDistribution(null)}>
                  Chia tự động lại
                </Button>
                <span className="text-sm text-mute">
                  {groupSizes.map((size, index) => `${groupDisplayName(index)}: ${size} đội`).join(" · ")}
                </span>
              </div>
              <div className="space-y-2">
                {teams.map((team, index) => {
                  const groupIndex = effectiveDistribution.findIndex((bucket) =>
                    bucket.includes(index),
                  );
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-3 rounded-lg border border-line/70 bg-subtle/40 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-strong">
                        {team.name || `Đội ${index + 1}`}
                      </span>
                      <Select
                        aria-label={`Bảng của ${team.name}`}
                        className="h-8 w-32! py-0 text-xs"
                        value={groupIndex}
                        onChange={(event) => {
                          const target = Number(event.target.value);
                          const next = effectiveDistribution.map((bucket) =>
                            bucket.filter((item) => item !== index),
                          );
                          while (next.length < numberOfGroups) next.push([]);
                          next[target].push(index);
                          setDistribution(next);
                        }}
                      >
                        {Array.from({ length: numberOfGroups }, (_, groupOrder) => (
                          <option key={groupOrder} value={groupOrder}>
                            {groupDisplayName(groupOrder)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Số đội" value={teams.filter((t) => t.name.trim()).length} />
                <StatTile label="Số bảng" value={numberOfGroups} />
                <StatTile label="Số sân" value={numberOfCourts} />
                <StatTile label="Trận vòng bảng" value={totalMatches} tone="success" />
              </div>
              <div className="space-y-2">
                {groupSizes.map((size, index) => (
                  <p key={index} className="rounded-lg bg-subtle/50 px-3 py-2 text-sm text-body">
                    <strong className="text-strong">{groupDisplayName(index)}</strong>: {size} đội →{" "}
                    {countRoundRobinMatches(size)} trận (vòng tròn 1 lượt)
                  </p>
                ))}
              </div>
              <p className="text-sm text-mute">
                Lịch sẽ được sinh tự động và phân luân phiên vào {numberOfCourts} sân, bảo đảm không
                đội nào phải đá 2 trận cùng lúc.
              </p>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-subtle/40 p-4">
                <h3 className="text-lg font-bold text-strong">{name}</h3>
                <p className="mt-1 text-sm text-mute">
                  {date} {location ? `· ${location}` : ""}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-mute">Đội</dt>
                    <dd className="font-semibold text-strong">
                      {teams.filter((t) => t.name.trim()).length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-mute">Bảng</dt>
                    <dd className="font-semibold text-strong">{numberOfGroups}</dd>
                  </div>
                  <div>
                    <dt className="text-mute">Sân</dt>
                    <dd className="font-semibold text-strong">{numberOfCourts}</dd>
                  </div>
                  <div>
                    <dt className="text-mute">Trận vòng bảng</dt>
                    <dd className="font-semibold text-brand-400">{totalMatches}</dd>
                  </div>
                  <div>
                    <dt className="text-mute">Điểm chạm</dt>
                    <dd className="font-semibold text-strong">
                      {groupTarget} / {knockoutTarget}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-mute">Hơn 2 điểm</dt>
                    <dd className="font-semibold text-strong">{winByTwo ? "Có" : "Không"}</dd>
                  </div>
                  <div>
                    <dt className="text-mute">Suất đi tiếp</dt>
                    <dd className="font-semibold text-strong">{qualifiers} mỗi bảng</dd>
                  </div>
                  <div>
                    <dt className="text-mute">Tranh hạng 3</dt>
                    <dd className="font-semibold text-strong">{thirdPlace ? "Có" : "Không"}</dd>
                  </div>
                </dl>
              </div>
              <p className="text-sm text-mute">
                Sau khi tạo, giải chuyển ngay sang trạng thái VÒNG BẢNG và trọng tài có thể nhập điểm.
              </p>
            </div>
          ) : null}

          <ValidationList errors={errors} warnings={warnings} />

          <div className="flex justify-between gap-2 border-t border-line/60 pt-4">
            <Button
              variant="ghost"
              className="border border-line"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0}
              icon={<ArrowLeft className="h-4 w-4" />}
            >
              Quay lại
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                variant="primary"
                onClick={() => setStep((value) => value + 1)}
                disabled={errors.length > 0}
              >
                Tiếp tục
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={handleCreate} loading={creating} icon={<Check className="h-4 w-4" />}>
                Tạo giải & bắt đầu
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
