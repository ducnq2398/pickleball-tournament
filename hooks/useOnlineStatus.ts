"use client";

/**
 * Trạng thái kết nối cho trọng tài.
 *
 * QUY TẮC (§39): không bao giờ hiển thị "đã lưu" khi chưa chắc chắn.
 * - `online`: trình duyệt có mạng.
 * - `pendingWrites`: Firestore còn thay đổi chưa đẩy lên server.
 * - `synced` = online && !pendingWrites -> lúc đó mới được nói là đã đồng bộ.
 */
import { useEffect, useState } from "react";
import { useTournamentContext } from "@/components/providers/TournamentProvider";

export interface ConnectionState {
  online: boolean;
  pendingWrites: boolean;
  fromCache: boolean;
  synced: boolean;
  label: string;
}

export function useOnlineStatus(): ConnectionState {
  const { hasPendingWrites, fromCache } = useTournamentContext();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const synced = online && !hasPendingWrites;
  return {
    online,
    pendingWrites: hasPendingWrites,
    fromCache,
    synced,
    label: !online ? "Mất mạng" : hasPendingWrites ? "Đang đồng bộ" : "Đã đồng bộ",
  };
}
