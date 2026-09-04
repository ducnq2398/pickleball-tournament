"use client";

/**
 * Nhánh knockout: các vòng, nhà vô địch, và nhãn hiển thị khi đội chưa xác định.
 */
import { useMemo } from "react";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import type { Match, Stage } from "@/types/tournament";
import {
  getBracketRounds,
  getChampionId,
  getRunnerUpId,
  getThirdPlaceId,
  isKnockoutStage,
} from "@/lib/tournament/knockout";
import { canCreateKnockout, getRemainingGroupMatches } from "@/lib/tournament/validation";

export interface KnockoutState {
  rounds: { stage: Stage; matches: Match[] }[];
  knockoutMatches: Match[];
  hasKnockout: boolean;
  championTeamId?: string;
  runnerUpTeamId?: string;
  thirdPlaceTeamId?: string;
  /** Số trận vòng bảng còn thiếu để mở knockout. */
  remainingGroupMatches: number;
  canCreate: boolean;
  createErrors: string[];
  createWarnings: string[];
}

export function useKnockout(): KnockoutState {
  const { matches, groups, tournament } = useTournamentContext();

  return useMemo(() => {
    const knockoutMatches = matches.filter((m) => isKnockoutStage(m.stage));
    const validation = tournament
      ? canCreateKnockout(tournament, groups, matches)
      : { ok: false, errors: ["Chưa chọn giải."], warnings: [] };

    return {
      rounds: getBracketRounds(matches),
      knockoutMatches,
      hasKnockout: knockoutMatches.length > 0,
      championTeamId: getChampionId(matches),
      runnerUpTeamId: getRunnerUpId(matches),
      thirdPlaceTeamId: getThirdPlaceId(matches),
      remainingGroupMatches: getRemainingGroupMatches(matches).length,
      canCreate: validation.ok,
      createErrors: validation.errors,
      createWarnings: validation.warnings,
    };
  }, [matches, groups, tournament]);
}
