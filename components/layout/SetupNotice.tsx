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
      <CardBody className="space-y-4 text-sm text-body">
        <p>
          Tạo file <code className="rounded bg-subtle px-1.5 py-0.5 text-strong">.env.local</code>{" "}
          ở thư mục gốc dự án (tham khảo{" "}
          <code className="rounded bg-subtle px-1.5 py-0.5 text-strong">.env.example</code>) rồi
          khởi động lại server.
        </p>
        <div>
          <p className="mb-2 font-medium text-strong">Biến còn thiếu:</p>
          <ul className="space-y-1">
            {missingEnv.map((key) => (
              <li key={key} className="rounded bg-subtle px-3 py-1.5 font-mono text-xs text-warn-400">
                {key}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-mute">
          Lấy giá trị tại Firebase Console → Project settings → General → Your apps → Web app.
        </p>
      </CardBody>
    </Card>
  );
}
