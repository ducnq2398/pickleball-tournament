"use client";

/**
 * Chỉ báo kết nối (§38, §39).
 * Không bao giờ nói "đã lưu" khi Firestore còn thay đổi chưa đẩy lên server.
 */
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";

export function ConnectionIndicator({ compact = false }: { compact?: boolean }) {
  const { online, pendingWrites, synced } = useOnlineStatus();

  const tone = !online
    ? "border-live-500/50 bg-live-500/15 text-live-400"
    : pendingWrites
      ? "border-warn-500/50 bg-warn-500/15 text-warn-400"
      : "border-brand-500/50 bg-brand-500/15 text-brand-400";

  const Icon = !online ? CloudOff : pendingWrites ? RefreshCw : Cloud;
  const label = !online ? "Offline" : pendingWrites ? "Đang đồng bộ" : "Online";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone,
      )}
      title={
        synced
          ? "Đã đồng bộ với máy chủ"
          : pendingWrites
            ? "Còn dữ liệu chưa đẩy lên máy chủ"
            : "Mất kết nối Internet — điểm có thể chưa được đồng bộ"
      }
    >
      <Icon className={cn("h-3.5 w-3.5", pendingWrites && "animate-spin")} />
      {compact ? null : label}
    </span>
  );
}

/** Băng cảnh báo lớn cho màn hình trọng tài. */
export function OfflineBanner() {
  const { online, pendingWrites } = useOnlineStatus();
  if (online && !pendingWrites) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        online
          ? "border-warn-500/50 bg-warn-500/10 text-warn-400"
          : "border-live-500/50 bg-live-500/10 text-live-400",
      )}
    >
      {online ? (
        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
      ) : (
        <CloudOff className="mt-0.5 h-5 w-5 shrink-0" />
      )}
      <div>
        <p className="font-semibold">
          {online ? "Đang đồng bộ dữ liệu..." : "Mất kết nối Internet."}
        </p>
        <p className="mt-0.5 text-body">
          {online
            ? "Điểm vừa nhập chưa được xác nhận trên máy chủ. Vui lòng giữ màn hình mở."
            : "Điểm có thể chưa được đồng bộ. Ứng dụng sẽ tự gửi lại khi có mạng — đừng đóng tab này."}
        </p>
      </div>
    </div>
  );
}
