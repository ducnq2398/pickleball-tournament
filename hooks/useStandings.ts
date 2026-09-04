"use client";

/**
 * Bảng xếp hạng — LUÔN được tính lại từ matches, không đọc từ Firestore.
 * Nhờ vậy BXH không bao giờ lệch với kết quả trận và không tốn thêm read/write.
 */
import { useMemo } from "react";
import { useTournamentContext } from "@/components/providers/TournamentProvider";
import type { Group, StandingRow } from "@/types/tournament";
import { calculateAllStandings, isGroupComplete } from "@/lib/tournament/standings";
import { DEFAULT_TOURNAMENT_CONFIG } from "@/lib/tournament/tournament";

export interface GroupStandings {
  group: Group;
  rows: StandingRow[];
  complete: boolean;
}

export function useStandings(): GroupStandings[] {
  const { groups, teams, matches, tournament } = useTournamentContext();
  const rules = tournament?.config.rankingRules ?? DEFAULT_TOURNAMENT_CONFIG.rankingRules;

  return useMemo(() => {
    const byGroup = calculateAllStandings(
      groups.map((g) => ({ id: g.id, teamIds: g.teamIds })),
      teams,
      matches,
      rules,
    );
    return groups
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((group) => ({
        group,
        rows: byGroup.get(group.id) ?? [],
        complete: isGroupComplete(group.id, matches),
      }));
  }, [groups, teams, matches, rules]);
}

export function useGroupStandings(groupId?: string): GroupStandings | undefined {
  const standings = useStandings();
  return useMemo(
    () => standings.find((item) => item.group.id === groupId),
    [standings, groupId],
  );
}
