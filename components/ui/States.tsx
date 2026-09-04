import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-brand-400", className)} />;
}

export function PageLoading({ label = "Đang tải dữ liệu..." }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-400">
      <LoadingSpinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-ink-700/60", className)} />;
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-600 bg-ink-850/60 px-6 py-10 text-center">
      <div className="text-ink-500">{icon ?? <Inbox className="h-8 w-8" />}</div>
      <div>
        <p className="font-semibold text-ink-100">{title}</p>
        {description ? <p className="mt-1 max-w-md text-sm text-ink-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Không tải được dữ liệu",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-live-500/40 bg-live-500/10 px-6 py-8 text-center">
      <AlertTriangle className="h-8 w-8 text-live-400" />
      <div>
        <p className="font-semibold text-ink-100">{title}</p>
        <p className="mt-1 max-w-lg text-sm text-ink-300">{message}</p>
      </div>
      {action}
    </div>
  );
}

/** Danh sách cảnh báo/lỗi từ ValidationResult. */
export function ValidationList({
  errors = [],
  warnings = [],
  className,
}: {
  errors?: string[];
  warnings?: string[];
  className?: string;
}) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div className={cn("space-y-2", className)}>
      {errors.map((error) => (
        <p
          key={error}
          className="flex gap-2 rounded-lg border border-live-500/40 bg-live-500/10 px-3 py-2 text-sm text-live-400"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ))}
      {warnings.map((warning) => (
        <p
          key={warning}
          className="flex gap-2 rounded-lg border border-warn-500/40 bg-warn-500/10 px-3 py-2 text-sm text-warn-400"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </p>
      ))}
    </div>
  );
}
