/**
 * Tất cả đường dẫn Firestore tập trung tại đây — UI không bao giờ tự ghép path.
 *
 * Sơ đồ dữ liệu:
 *   tournaments/{tournamentId}
 *     ├── teams/{teamId}
 *     ├── groups/{groupId}
 *     ├── matches/{matchId}
 *     ├── courts/{courtId}
 *     └── auditLogs/{logId}
 *   users/{userId}
 */
import { collection, doc, type CollectionReference, type DocumentReference } from "firebase/firestore";
import { getDb } from "@/lib/firebase";

export const TOURNAMENTS = "tournaments";
export const TEAMS = "teams";
export const GROUPS = "groups";
export const MATCHES = "matches";
export const COURTS = "courts";
export const AUDIT_LOGS = "auditLogs";
export const USERS = "users";

export function tournamentsCol(): CollectionReference {
  return collection(getDb(), TOURNAMENTS);
}

export function tournamentDoc(tournamentId: string): DocumentReference {
  return doc(getDb(), TOURNAMENTS, tournamentId);
}

function subCol(tournamentId: string, name: string): CollectionReference {
  return collection(getDb(), TOURNAMENTS, tournamentId, name);
}

export const teamsCol = (tournamentId: string) => subCol(tournamentId, TEAMS);
export const groupsCol = (tournamentId: string) => subCol(tournamentId, GROUPS);
export const matchesCol = (tournamentId: string) => subCol(tournamentId, MATCHES);
export const courtsCol = (tournamentId: string) => subCol(tournamentId, COURTS);
export const auditLogsCol = (tournamentId: string) => subCol(tournamentId, AUDIT_LOGS);

export const teamDoc = (tournamentId: string, teamId: string) =>
  doc(getDb(), TOURNAMENTS, tournamentId, TEAMS, teamId);
export const groupDoc = (tournamentId: string, groupId: string) =>
  doc(getDb(), TOURNAMENTS, tournamentId, GROUPS, groupId);
export const matchDoc = (tournamentId: string, matchId: string) =>
  doc(getDb(), TOURNAMENTS, tournamentId, MATCHES, matchId);
export const courtDoc = (tournamentId: string, courtId: string) =>
  doc(getDb(), TOURNAMENTS, tournamentId, COURTS, courtId);

export const userDoc = (userId: string) => doc(getDb(), USERS, userId);
export const usersCol = () => collection(getDb(), USERS);

/** Sinh id mới do Firestore cấp (dùng khi cần biết id TRƯỚC khi ghi). */
export const newMatchId = (tournamentId: string) => doc(matchesCol(tournamentId)).id;
export const newTeamId = (tournamentId: string) => doc(teamsCol(tournamentId)).id;
export const newTournamentId = () => doc(tournamentsCol()).id;
