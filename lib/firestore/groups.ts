/**
 * Repository cho `groups`.
 *
 * `group.teamIds` là nguồn sự thật về thành phần bảng; `team.groupId` là bản
 * sao tiện tra cứu. Mọi thay đổi đều ghi CẢ HAI trong cùng một batch để không
 * bao giờ lệch nhau.
 */
import {
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import type { Group, Team } from "@/types/tournament";
import { getDb } from "@/lib/firebase";
import { sameMembers } from "@/lib/utils";
import { distributeTeams, groupDisplayName } from "@/lib/tournament/tournament";
import { validateGroupSetup } from "@/lib/tournament/validation";
import { groupDoc, groupsCol, teamDoc } from "./paths";
import { clean, parseGroup } from "./converters";
import { logAudit, type AuditActor } from "./auditLogs";
import { assertValid } from "./errors";

export function watchGroups(
  tournamentId: string,
  onData: (groups: Group[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(groupsCol(tournamentId), orderBy("order", "asc"));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => parseGroup(d.id, d.data()))),
    (error) => onError?.(error),
  );
}

/** Tạo/xoá bảng cho khớp số bảng trong cấu hình. Không đụng bảng đã có đội. */
export async function ensureGroups(
  tournamentId: string,
  desiredCount: number,
  qualifiersPerGroup: number,
  existing: Group[],
): Promise<void> {
  const batch = writeBatch(getDb());
  const sorted = [...existing].sort((a, b) => a.order - b.order);

  for (let i = existing.length; i < desiredCount; i++) {
    batch.set(
      doc(groupsCol(tournamentId)),
      clean({
        name: groupDisplayName(i),
        order: i,
        teamIds: [],
        qualificationSlots: qualifiersPerGroup,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  }

  for (const group of sorted.slice(desiredCount)) {
    // Chỉ xoá bảng rỗng — bảng có đội phải do admin xử lý thủ công.
    if (group.teamIds.length === 0) batch.delete(groupDoc(tournamentId, group.id));
  }

  await batch.commit();
}

export async function updateGroup(
  tournamentId: string,
  groupId: string,
  patch: Partial<Pick<Group, "name" | "qualificationSlots" | "order">>,
): Promise<void> {
  await updateDoc(
    groupDoc(tournamentId, groupId),
    clean({ ...patch, updatedAt: serverTimestamp() }),
  );
}

export async function deleteGroup(tournamentId: string, group: Group): Promise<void> {
  const batch = writeBatch(getDb());
  batch.delete(groupDoc(tournamentId, group.id));
  for (const teamId of group.teamIds) {
    batch.update(teamDoc(tournamentId, teamId), { groupId: null, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

export interface GroupAssignment {
  groupId: string;
  teamIds: string[];
}

/**
 * Lưu kết quả chia bảng. Chỉ ghi những gì thực sự thay đổi để tiết kiệm write.
 */
export async function saveGroupAssignments(
  tournamentId: string,
  assignments: GroupAssignment[],
  groups: Group[],
  teams: Team[],
  actor?: AuditActor,
): Promise<void> {
  const nextGroups = groups.map((group) => ({
    ...group,
    teamIds: assignments.find((a) => a.groupId === group.id)?.teamIds ?? group.teamIds,
  }));
  assertValid(validateGroupSetup(nextGroups, teams));

  const batch = writeBatch(getDb());
  let writes = 0;

  for (const assignment of assignments) {
    const current = groups.find((g) => g.id === assignment.groupId);
    if (!current) continue;
    if (
      current.teamIds.length === assignment.teamIds.length &&
      current.teamIds.every((id, index) => id === assignment.teamIds[index])
    ) {
      continue;
    }
    batch.update(groupDoc(tournamentId, assignment.groupId), {
      teamIds: assignment.teamIds,
      updatedAt: serverTimestamp(),
    });
    writes += 1;
  }

  const nextGroupIdByTeam = new Map<string, string>();
  for (const assignment of assignments) {
    for (const teamId of assignment.teamIds) nextGroupIdByTeam.set(teamId, assignment.groupId);
  }
  for (const team of teams) {
    const nextGroupId = nextGroupIdByTeam.get(team.id);
    if ((team.groupId ?? undefined) === nextGroupId) continue;
    batch.update(teamDoc(tournamentId, team.id), {
      groupId: nextGroupId ?? null,
      updatedAt: serverTimestamp(),
    });
    writes += 1;
  }

  if (writes === 0) return;
  await batch.commit();

  await logAudit(
    tournamentId,
    {
      action: "UPDATE_GROUPS",
      previousData: groups.map((g) => ({ id: g.id, teamIds: g.teamIds })),
      newData: assignments,
      message: "Cập nhật chia bảng",
    },
    actor,
  );
}

/** Chia đội tự động theo kiểu snake (9 đội / 2 bảng → 5 và 4). */
export function autoDistribute(teams: Team[], groups: Group[]): GroupAssignment[] {
  const ordered = [...teams].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.createdAt - b.createdAt);
  const buckets = distributeTeams(
    ordered.map((t) => t.id),
    groups.length,
  );
  return groups
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((group, index) => ({ groupId: group.id, teamIds: buckets[index] ?? [] }));
}

/** Chuyển 1 đội sang bảng khác (trả về assignment mới, chưa ghi DB). */
export function moveTeamBetweenGroups(
  assignments: GroupAssignment[],
  teamId: string,
  targetGroupId: string,
): GroupAssignment[] {
  return assignments.map((assignment) => {
    const without = assignment.teamIds.filter((id) => id !== teamId);
    if (assignment.groupId !== targetGroupId) return { ...assignment, teamIds: without };
    return { ...assignment, teamIds: [...without, teamId] };
  });
}

export function assignmentsEqual(a: GroupAssignment[], b: GroupAssignment[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item) => {
    const other = b.find((x) => x.groupId === item.groupId);
    return !!other && sameMembers(item.teamIds, other.teamIds);
  });
}
