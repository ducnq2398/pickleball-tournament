/**
 * AUDIT LOG — ai đã sửa gì, lúc nào.
 *
 * Nguyên tắc: ghi log KHÔNG BAO GIỜ được làm hỏng thao tác chính. Mọi lỗi khi
 * ghi log đều bị nuốt (chỉ warn ra console) — điểm số quan trọng hơn nhật ký.
 */
import { addDoc, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import type { AuditAction, AuditLog } from "@/types/tournament";
import { auditLogsCol } from "./paths";
import { clean, parseAuditLog } from "./converters";

/** Người thực hiện thao tác (lấy từ AuthProvider). */
export interface AuditActor {
  userId?: string;
  userName?: string;
}

export interface AuditEntry {
  action: AuditAction;
  matchId?: string;
  teamId?: string;
  previousData?: unknown;
  newData?: unknown;
  message?: string;
}

export async function logAudit(
  tournamentId: string,
  entry: AuditEntry,
  actor?: AuditActor,
): Promise<void> {
  try {
    await addDoc(
      auditLogsCol(tournamentId),
      clean({
        ...entry,
        previousData: entry.previousData ?? null,
        newData: entry.newData ?? null,
        userId: actor?.userId ?? null,
        userName: actor?.userName ?? null,
        createdAt: serverTimestamp(),
      }),
    );
  } catch (error) {
    console.warn("[audit] Không ghi được nhật ký:", error);
  }
}

/** Realtime nhật ký gần nhất (trang Admin > Cài đặt). */
export function watchAuditLogs(
  tournamentId: string,
  max: number,
  onData: (logs: AuditLog[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(auditLogsCol(tournamentId), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => parseAuditLog(d.id, d.data()))),
    (error) => onError?.(error),
  );
}
