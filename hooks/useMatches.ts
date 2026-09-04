"use client";

/**
 * Các lát cắt dữ liệu trận đấu, tính bằng useMemo để không re-render thừa.
 */
import { useMemo } from "react";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import type { Match, Stage } from "@/types/tournament";
import { isKnockoutStage } from "@/lib/tournament/knockout";
import {
  getLiveMatches,
  getProgress,
  getRecentResults,
  getUpcomingMatches,
} from "@/lib/tournament/tournament";

export function useMatches() {
  const { matches, loading, error, fromCache, hasPendingWrites } = useTournamentContext();

  return useMemo(() => {
    const groupMatches = matches.filter((m) => m.stage === "GROUP");
    const knockoutMatches = matches.filter((m) => isKnockoutStage(m.stage));

    return {
      matches,
      groupMatches,
      knockoutMatches,
      liveMatches: getLiveMatches(matches),
      recentResults: getRecentResults(matches),
      upcoming: getUpcomingMatches(matches),
      progress: getProgress(matches),
      groupProgress: getProgress(groupMatches),
      knockoutProgress: getProgress(knockoutMatches),
      loading,
      error,
      fromCache,
      hasPendingWrites,
    };
  }, [matches, loading, error, fromCache, hasPendingWrites]);
}

export function useMatch(matchId?: string): Match | undefined {
  const { matches } = useTournamentContext();
  return useMemo(
    () => (matchId ? matches.find((m) => m.id === matchId) : undefined),
    [matches, matchId],
  );
}

export function useMatchesByGroup(groupId?: string): Match[] {
  const { matches } = useTournamentContext();
  return useMemo(
    () =>
      matches
        .filter((m) => m.stage === "GROUP" && (!groupId || m.groupId === groupId))
        .sort((a, b) => a.order - b.order),
    [matches, groupId],
  );
}

export function useMatchesByStage(stage: Stage): Match[] {
  const { matches } = useTournamentContext();
  return useMemo(
    () => matches.filter((m) => m.stage === stage).sort((a, b) => a.order - b.order),
    [matches, stage],
  );
}
