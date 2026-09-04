/**
 * Tạo một giải hoàn chỉnh trong vài batch: giải → đội → bảng → sân → lịch.
 *
 * Dùng chung cho Wizard tạo giải (§50) và chức năng tạo giải mẫu (§42), nên
 * chỉ có MỘT chỗ duy nhất quyết định cấu trúc dữ liệu ban đầu.
 */
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import type { TournamentConfig } from "@/types/tournament";
import { getDb } from "@/lib/firebase";
import { chunk, createId } from "@/lib/utils";
import { courtDisplayName, distributeTeams, groupDisplayName } from "@/lib/tournament/tournament";
import { generateGroupSchedule } from "@/lib/tournament/schedule";
import {
  courtsCol,
  groupsCol,
  matchesCol,
  newTournamentId,
  teamsCol,
  tournamentDoc,
} from "./paths";
import { clean } from "./converters";
import { logAudit, type AuditActor } from "./auditLogs";
import { AppError } from "./errors";

export interface BootstrapTeamInput {
  name: string;
  playerNames: string[];
  note?: string;
}

export interface BootstrapInput {
  name: string;
  date?: string;
  location?: string;
  config: TournamentConfig;
  teams: BootstrapTeamInput[];
  /**
   * Phân bổ đội vào bảng theo CHỈ SỐ trong mảng `teams`.
   * Bỏ trống -> tự chia kiểu snake (9 đội / 2 bảng → 5 và 4).
   */
  distribution?: number[][];
  /** Sinh luôn lịch vòng bảng. */
  generateSchedule?: boolean;
  /** Chuyển sang trạng thái GROUP_STAGE ngay sau khi tạo. */
  startImmediately?: boolean;
}

export interface BootstrapResult {
  tournamentId: string;
  teamCount: number;
  groupCount: number;
  courtCount: number;
  matchCount: number;
}

export async function createTournamentWithData(
  input: BootstrapInput,
  actor?: AuditActor,
): Promise<BootstrapResult> {
  const name = input.name.trim();
  if (!name) throw new AppError("Tên giải không được để trống.");

  const validTeams = input.teams
    .map((team) => ({
      ...team,
      name: team.name.trim(),
      playerNames: team.playerNames.map((player) => player.trim()).filter(Boolean),
    }))
    .filter((team) => team.name.length > 0);

  if (validTeams.length < 2) throw new AppError("Cần ít nhất 2 đội để tạo giải.");

  const tournamentId = newTournamentId();
  const config: TournamentConfig = { ...input.config, numberOfTeams: validTeams.length };

  const teams = validTeams.map((team) => ({
    id: doc(teamsCol(tournamentId)).id,
    name: team.name,
    note: team.note,
    players: team.playerNames.map((playerName) => ({ id: createId("p"), name: playerName })),
  }));

  const buckets =
    input.distribution?.map((indexes) =>
      indexes.map((index) => teams[index]?.id).filter((id): id is string => !!id),
    ) ?? distributeTeams(teams.map((team) => team.id), config.numberOfGroups);

  const groups = Array.from({ length: config.numberOfGroups }, (_, index) => ({
    id: `group-${String.fromCharCode(97 + index)}`,
    name: groupDisplayName(index),
    order: index,
    teamIds: buckets[index] ?? [],
    qualificationSlots: config.qualifiersPerGroup,
  }));

  const courts = Array.from({ length: config.numberOfCourts }, (_, index) => ({
    id: `court-${index + 1}`,
    name: courtDisplayName(index + 1),
    number: index + 1,
  }));

  const drafts = input.generateSchedule
    ? generateGroupSchedule({
        groups,
        targetScore: config.groupTargetScore,
        winByTwo: config.winByTwo,
        courtIds: courts.map((court) => court.id),
      })
    : [];

  const setupBatch = writeBatch(getDb());
  setupBatch.set(
    tournamentDoc(tournamentId),
    clean({
      name,
      date: input.date || undefined,
      location: input.location || undefined,
      status: input.startImmediately && drafts.length > 0 ? "GROUP_STAGE" : "DRAFT",
      config,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  for (const team of teams) {
    const groupId = groups.find((group) => group.teamIds.includes(team.id))?.id;
    setupBatch.set(
      doc(teamsCol(tournamentId), team.id),
      clean({
        name: team.name,
        players: team.players,
        note: team.note || undefined,
        groupId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  }

  for (const group of groups) {
    setupBatch.set(
      doc(groupsCol(tournamentId), group.id),
      clean({
        name: group.name,
        order: group.order,
        teamIds: group.teamIds,
        qualificationSlots: group.qualificationSlots,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  }

  for (const court of courts) {
    setupBatch.set(
      doc(courtsCol(tournamentId), court.id),
      clean({
        name: court.name,
        number: court.number,
        status: "AVAILABLE",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  }

  await setupBatch.commit();

  for (const part of chunk(drafts, 400)) {
    const batch = writeBatch(getDb());
    for (const draft of part) {
      batch.set(
        doc(matchesCol(tournamentId)),
        clean({ ...draft, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
      );
    }
    await batch.commit();
  }

  await logAudit(
    tournamentId,
    {
      action: "CREATE_TOURNAMENT",
      newData: {
        teams: teams.length,
        groups: groups.length,
        courts: courts.length,
        matches: drafts.length,
      },
      message: `Tạo giải "${name}": ${teams.length} đội, ${groups.length} bảng, ${drafts.length} trận`,
    },
    actor,
  );

  return {
    tournamentId,
    teamCount: teams.length,
    groupCount: groups.length,
    courtCount: courts.length,
    matchCount: drafts.length,
  };
}
