"use client";

/**
 * Trang chủ: tổng quan giải + lối vào nhanh cho từng nhóm người dùng.
 */
import Link from "next/link";
import { useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ListOrdered,
  MapPin,
  Monitor,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, StatTile } from "@/components/ui/Card";
import { TournamentStatusBadge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/ui/States";
import { MatchCard } from "@/components/match/MatchCard";
import { useTournament } from "@/hooks/useTournament";
import { useMatches } from "@/hooks/useMatches";
import { useToast } from "@/components/providers/ToastProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { seedSampleTournament } from "@/lib/firestore/seed";
import { formatDate } from "@/lib/utils";

const SECTIONS = [
  {
    href: "/scoreboard",
    title: "Bảng điểm trực tiếp",
    description: "Màn hình cho TV/khán giả, tỷ số cập nhật realtime.",
    icon: Monitor,
  },
  {
    href: "/standings",
    title: "Bảng xếp hạng",
    description: "Thứ hạng từng bảng, tự động tính sau mỗi trận.",
    icon: ListOrdered,
  },
  {
    href: "/knockout",
    title: "Nhánh knockout",
    description: "Bán kết, chung kết và nhà vô địch.",
    icon: Trophy,
  },
  {
    href: "/referee",
    title: "Màn hình trọng tài",
    description: "Nhập điểm nhanh theo sân được phân công.",
    icon: ClipboardList,
  },
  {
    href: "/admin",
    title: "Trang quản trị",
    description: "Đội, bảng đấu, lịch thi đấu, phân sân.",
    icon: LayoutDashboard,
  },
];

export default function HomePage() {
  const { tournament, teams, groups, courts, loading, error, configured, isEmpty, selectTournament } =
    useTournament();
  const { matches, liveMatches, groupProgress } = useMatches();
  const { notify, notifyError } = useToast();
  const { actor } = useAuth();
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const id = await seedSampleTournament({}, actor);
      selectTournament(id);
      notify("Đã tạo giải mẫu với 9 đội, 2 bảng và 16 trận vòng bảng.", "success");
    } catch (seedError) {
      notifyError(seedError);
    } finally {
      setSeeding(false);
    }
  };

  if (!configured) {
    return (
      <AppShell>
        <SetupNotice />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {loading ? (
        <PageLoading />
      ) : error ? (
        <ErrorState message={error} />
      ) : isEmpty || !tournament ? (
        <EmptyState
          icon={<Trophy className="h-10 w-10" />}
          title="Chưa có giải đấu nào"
          description="Tạo giải mẫu để thử ngay tính năng realtime, hoặc tự tạo giải mới theo từng bước."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" loading={seeding} onClick={handleSeed} icon={<Sparkles className="h-4 w-4" />}>
                Tạo giải mẫu
              </Button>
              <Link href="/admin/setup">
                <Button variant="secondary">Tạo giải mới</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <TournamentStatusBadge status={tournament.status} />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-strong sm:text-3xl">
                    {tournament.name}
                  </h1>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-mute">
                    {tournament.date ? (
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-4 w-4" />
                        {formatDate(tournament.date)}
                      </span>
                    ) : null}
                    {tournament.location ? (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {tournament.location}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {teams.length} đội · {groups.length} bảng · {courts.length} sân
                    </span>
                  </div>
                </div>
                <Link href="/scoreboard">
                  <Button variant="primary" icon={<Monitor className="h-4 w-4" />}>
                    Xem bảng điểm
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Tổng số trận" value={matches.length} />
                <StatTile label="Đã đấu" value={groupProgress.finished} tone="success" />
                <StatTile label="Đang đấu" value={liveMatches.length} tone="live" />
                <StatTile
                  label="Còn lại"
                  value={matches.length - matches.filter((m) => m.status === "FINISHED").length}
                  tone="warning"
                />
              </div>
            </CardBody>
          </Card>

          {liveMatches.length > 0 ? (
            <Card>
              <CardHeader
                title="Đang thi đấu"
                description="Tỷ số cập nhật tự động, không cần tải lại trang."
                icon={<Monitor className="h-5 w-5" />}
              />
              <CardBody className="grid gap-3 md:grid-cols-2">
                {liveMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    teams={teams}
                    groups={groups}
                    courts={courts}
                  />
                ))}
              </CardBody>
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((section) => (
              <Link key={section.href} href={section.href} className="group">
                <Card className="h-full transition-colors group-hover:border-brand-500/60">
                  <CardBody className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-brand-400">
                      <section.icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block font-semibold text-strong">{section.title}</span>
                      <span className="mt-0.5 block text-sm text-mute">{section.description}</span>
                    </span>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
