"use client";

/**
 * Màn hình hướng dẫn khi chưa cấu hình Firebase — thay vì để trang trắng.
 */
import { KeyRound } from "lucide-react";
import { useTournament } from "@/hooks/useTournament";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export function SetupNotice() {
  const { missingEnv } = useTournament();

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader
        icon={<KeyRound className="h-5 w-5" />}
        title="Chưa cấu hình Firebase"
        description="Ứng dụng cần kết nối Firestore để hoạt động."
      />
      <CardBody className="space-y-4 text-sm text-ink-300">
        <p>
          Tạo file <code className="rounded bg-ink-800 px-1.5 py-0.5 text-ink-100">.env.local</code>{" "}
          ở thư mục gốc dự án (tham khảo{" "}
          <code className="rounded bg-ink-800 px-1.5 py-0.5 text-ink-100">.env.example</code>) rồi
          khởi động lại server.
        </p>
        <div>
          <p className="mb-2 font-medium text-ink-100">Biến còn thiếu:</p>
          <ul className="space-y-1">
            {missingEnv.map((key) => (
              <li key={key} className="rounded bg-ink-800 px-3 py-1.5 font-mono text-xs text-warn-400">
                {key}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-ink-400">
          Lấy giá trị tại Firebase Console → Project settings → General → Your apps → Web app.
        </p>
      </CardBody>
    </Card>
  );
}
