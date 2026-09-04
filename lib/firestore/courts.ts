/**
 * Repository cho `courts`.
 *
 * `court.currentMatchId` đóng vai trò "khoá sân": transaction start/finish match
 * đọc và ghi trường này để không bao giờ có 2 trận LIVE trên cùng một sân.
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
import type { Court, CourtStatus } from "@/types/tournament";
import { getDb } from "@/lib/firebase";
import { courtDisplayName } from "@/lib/tournament/tournament";
import { courtDoc, courtsCol } from "./paths";
import { clean, parseCourt } from "./converters";

export function watchCourts(
  tournamentId: string,
  onData: (courts: Court[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(courtsCol(tournamentId), orderBy("number", "asc"));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => parseCourt(d.id, d.data()))),
    (error) => onError?.(error),
  );
}

/** Tạo/xoá sân cho khớp cấu hình. Sân đang có trận sẽ không bị xoá. */
export async function ensureCourts(
  tournamentId: string,
  desiredCount: number,
  existing: Court[],
): Promise<void> {
  const batch = writeBatch(getDb());
  const byNumber = new Map(existing.map((court) => [court.number, court]));

  for (let number = 1; number <= desiredCount; number++) {
    if (byNumber.has(number)) continue;
    batch.set(
      doc(courtsCol(tournamentId), `court-${number}`),
      clean({
        name: courtDisplayName(number),
        number,
        status: "AVAILABLE" satisfies CourtStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  }

  for (const court of existing) {
    if (court.number <= desiredCount) continue;
    if (court.currentMatchId) continue; // đang thi đấu -> giữ lại
    batch.delete(courtDoc(tournamentId, court.id));
  }

  await batch.commit();
}

export async function updateCourt(
  tournamentId: string,
  courtId: string,
  patch: Partial<Pick<Court, "name" | "number" | "status">>,
): Promise<void> {
  await updateDoc(courtDoc(tournamentId, courtId), clean({ ...patch, updatedAt: serverTimestamp() }));
}

/** Giải phóng sân thủ công (khi dữ liệu bị kẹt vì mất mạng giữa chừng). */
export async function releaseCourt(tournamentId: string, courtId: string): Promise<void> {
  await updateDoc(courtDoc(tournamentId, courtId), {
    currentMatchId: null,
    status: "AVAILABLE",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCourt(tournamentId: string, courtId: string): Promise<void> {
  await deleteDoc(courtDoc(tournamentId, courtId));
}
