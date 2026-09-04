"use client";

/**
 * Chọn giải đang xem. Lựa chọn lưu ở localStorage (chỉ là tiện ích UI).
 */
import { Trophy } from "lucide-react";
import { useTournament } from "@/hooks/useTournament";
import { Select } from "@/components/ui/Input";

export function TournamentSwitcher({ className }: { className?: string }) {
  const { tournaments, tournamentId, selectTournament } = useTournament();

  if (tournaments.length <= 1) return null;

  return (
    <div className={className}>
      <label className="sr-only" htmlFor="tournament-switcher">
        Chọn giải
      </label>
      <div className="relative">
        <Trophy className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Select
          id="tournament-switcher"
          className="h-9 py-0 pl-8 text-sm"
          value={tournamentId ?? ""}
          onChange={(event) => selectTournament(event.target.value || null)}
        >
          {tournaments.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {tournament.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
