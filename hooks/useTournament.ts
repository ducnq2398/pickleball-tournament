"use client";

/**
 * Truy cập giải đang chọn. Không tự mở listener — dùng chung listener của
 * TournamentProvider để tránh nhân đôi chi phí Firestore.
 */
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import { DEFAULT_TOURNAMENT_CONFIG } from "@/lib/tournament/tournament";
import type { TournamentConfig } from "@/types/tournament";

export function useTournament() {
  const {
    tournament,
    tournaments,
    tournamentId,
    selectTournament,
    loading,
    error,
    configured,
    missingEnv,
    teams,
    groups,
    courts,
  } = useTournamentContext();

  return {
    tournament,
    tournaments,
    tournamentId,
    selectTournament,
    teams,
    groups,
    courts,
    loading,
    error,
    configured,
    missingEnv,
    isEmpty: !loading && tournaments.length === 0,
  };
}

/** Cấu hình giải (có fallback an toàn khi chưa tải xong). */
export function useTournamentConfig(): TournamentConfig {
  const { tournament } = useTournamentContext();
  return tournament?.config ?? DEFAULT_TOURNAMENT_CONFIG;
}
