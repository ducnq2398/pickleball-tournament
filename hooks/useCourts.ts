"use client";

/**
 * Sân thi đấu + trận hiện tại trên mỗi sân.
 */
import { useMemo } from "react";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import type { Court, Match } from "@/types/tournament";
import { findCourtByParam, getMatchOnCourt, getUpcomingMatches } from "@/lib/tournament/tournament";

export interface CourtWithMatch {
  court: Court;
  liveMatch?: Match;
  nextMatch?: Match;
}

export function useCourts(): {
  courts: Court[];
  courtsWithMatches: CourtWithMatch[];
  loading: boolean;
} {
  const { courts, matches, loading } = useTournamentContext();

  const courtsWithMatches = useMemo(
    () =>
      courts.map((court) => {
        const liveMatch = getMatchOnCourt(matches, court.id);
        const nextMatch = getUpcomingMatches(matches, court.id).find(
          (m) => m.courtId === court.id,
        );
        return { court, liveMatch, nextMatch };
      }),
    [courts, matches],
  );

  return { courts, courtsWithMatches, loading };
}

/** Tra sân theo tham số URL (chấp nhận id document hoặc số sân). */
export function useCourt(param: string): CourtWithMatch | undefined {
  const { courts, matches } = useTournamentContext();

  return useMemo(() => {
    const court = findCourtByParam(courts, param);
    if (!court) return undefined;
    return {
      court,
      liveMatch: getMatchOnCourt(matches, court.id),
      nextMatch: getUpcomingMatches(matches, court.id).find((m) => m.courtId === court.id),
    };
  }, [courts, matches, param]);
}
