import type { Match, Team } from "@/types/tournament";
import { sourceLabel } from "@/lib/tournament/knockout";
import { cn } from "@/lib/utils";

/**
 * Hiển thị tên đội. Nếu đội chưa xác định (knockout chờ kết quả) thì hiện nhãn
 * nguồn suất: "Nhất bảng A", "Thắng Bán kết 1".
 */
export function TeamName({
  teamId,
  match,
  slot,
  teams,
  className,
  showPlayers = false,
}: {
  teamId?: string;
  match?: Match;
  slot?: 1 | 2;
  teams: Team[];
  className?: string;
  showPlayers?: boolean;
}) {
  const team = teamId ? teams.find((t) => t.id === teamId) : undefined;

  if (!team) {
    const source = slot === 1 ? match?.team1Source : slot === 2 ? match?.team2Source : undefined;
    return (
      <span className={cn("italic text-ink-400", className)}>
        {source ? sourceLabel(source) : "Chưa xác định"}
      </span>
    );
  }

  return (
    <span className={cn("min-w-0", className)}>
      <span className="block truncate font-semibold text-ink-100">{team.name}</span>
      {showPlayers && team.players.length > 0 ? (
        <span className="block truncate text-xs font-normal text-ink-400">
          {team.players.map((player) => player.name).join(" · ")}
        </span>
      ) : null}
    </span>
  );
}
