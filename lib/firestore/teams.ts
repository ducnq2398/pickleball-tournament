/**
 * Repository cho `teams`.
 *
 * Lưu ý toàn vẹn dữ liệu: đội bị xoá thì các trận liên quan cũng phải xoá,
 * và phải gỡ khỏi `group.teamIds` — nếu không bảng xếp hạng sẽ sai.
 */
import {
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { Match, Player, Team } from "@/types/tournament";
import { getDb } from "@/lib/firebase";
import { chunk, createId } from "@/lib/utils";
import { validateTeamInput } from "@/lib/tournament/validation";
import { groupDoc, groupsCol, matchesCol, teamDoc, teamsCol } from "./paths";
import { clean, parseTeam } from "./converters";
import { logAudit, type AuditActor } from "./auditLogs";
import { assertValid } from "./errors";

export function watchTeams(
  tournamentId: string,
  onData: (teams: Team[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(teamsCol(tournamentId), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => parseTeam(d.id, d.data()))),
    (error) => onError?.(error),
  );
}

export interface TeamInput {
  name: string;
  playerNames: string[];
  note?: string;
  seed?: number;
}

function toPlayers(playerNames: string[], existing?: Player[]): Player[] {
  return playerNames
    .map((name, index) => ({
      id: existing?.[index]?.id ?? createId("p"),
      name: name.trim(),
    }))
    .filter((player) => player.name.length > 0);
}

export async function createTeam(
  tournamentId: string,
  input: TeamInput,
  existingTeams: Team[],
  actor?: AuditActor,
): Promise<string> {
  assertValid(validateTeamInput(input.name, input.playerNames, existingTeams));

  const ref = doc(teamsCol(tournamentId));
  const batch = writeBatch(getDb());
  batch.set(
    ref,
    clean({
      name: input.name.trim(),
      players: toPlayers(input.playerNames),
      note: input.note?.trim() || undefined,
      seed: input.seed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  await batch.commit();

  await logAudit(
    tournamentId,
    { action: "CREATE_TEAM", teamId: ref.id, newData: input, message: `Thêm đội ${input.name}` },
    actor,
  );
  return ref.id;
}

/** Tạo nhiều đội một lần (wizard nhập nhanh / seed). */
export async function createTeams(
  tournamentId: string,
  inputs: TeamInput[],
  actor?: AuditActor,
): Promise<string[]> {
  const ids: string[] = [];
  for (const group of chunk(inputs, 400)) {
    const batch = writeBatch(getDb());
    for (const input of group) {
      const ref = doc(teamsCol(tournamentId));
      ids.push(ref.id);
      batch.set(
        ref,
        clean({
          name: input.name.trim(),
          players: toPlayers(input.playerNames),
          note: input.note?.trim() || undefined,
          seed: input.seed,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }
    await batch.commit();
  }
  await logAudit(
    tournamentId,
    { action: "CREATE_TEAM", newData: { count: inputs.length }, message: `Thêm ${inputs.length} đội` },
    actor,
  );
  return ids;
}

export async function updateTeam(
  tournamentId: string,
  team: Team,
  input: TeamInput,
  existingTeams: Team[],
  actor?: AuditActor,
): Promise<void> {
  assertValid(validateTeamInput(input.name, input.playerNames, existingTeams, team.id));

  await updateDoc(
    teamDoc(tournamentId, team.id),
    clean({
      name: input.name.trim(),
      players: toPlayers(input.playerNames, team.players),
      note: input.note?.trim() || undefined,
      seed: input.seed,
      updatedAt: serverTimestamp(),
    }),
  );

  await logAudit(
    tournamentId,
    {
      action: "UPDATE_TEAM",
      teamId: team.id,
      previousData: { name: team.name, players: team.players },
      newData: input,
      message: `Sửa đội ${team.name}`,
    },
    actor,
  );
}

/**
 * Xoá đội: gỡ khỏi bảng, xoá mọi trận có đội này (UI phải confirm trước khi gọi).
 */
export async function deleteTeam(
  tournamentId: string,
  team: Team,
  actor?: AuditActor,
): Promise<void> {
  const batch = writeBatch(getDb());
  batch.delete(teamDoc(tournamentId, team.id));

  const [asTeam1, asTeam2] = await Promise.all([
    getDocs(query(matchesCol(tournamentId), where("team1Id", "==", team.id))),
    getDocs(query(matchesCol(tournamentId), where("team2Id", "==", team.id))),
  ]);
  const matchIds = new Set<string>();
  for (const document of [...asTeam1.docs, ...asTeam2.docs]) {
    if (matchIds.has(document.id)) continue;
    matchIds.add(document.id);
    batch.delete(document.ref);
  }

  if (team.groupId) {
    const groups = await getDocs(
      query(groupsCol(tournamentId), where("teamIds", "array-contains", team.id)),
    );
    for (const document of groups.docs) {
      const teamIds = (document.data().teamIds as string[]).filter((id) => id !== team.id);
      batch.update(groupDoc(tournamentId, document.id), {
        teamIds,
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
  await logAudit(
    tournamentId,
    {
      action: "DELETE_TEAM",
      teamId: team.id,
      previousData: { name: team.name, groupId: team.groupId },
      message: `Xoá đội ${team.name} (kèm ${matchIds.size} trận)`,
    },
    actor,
  );
}

/** Đếm số trận đã có dữ liệu của một đội — dùng cho hộp thoại xác nhận xoá. */
export function countTeamMatches(teamId: string, matches: Match[]): { total: number; played: number } {
  const list = matches.filter((m) => m.team1Id === teamId || m.team2Id === teamId);
  return {
    total: list.length,
    played: list.filter((m) => m.status !== "SCHEDULED").length,
  };
}
