"use client";

/**
 * Chặn truy cập theo vai trò. Public pages KHÔNG dùng component này.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageLoading } from "@/components/ui/States";

export function AuthGate({
  require: required,
  children,
}: {
  require: "ADMIN" | "SCORER";
  children: ReactNode;
}) {
  const { loading, user, isAdmin, canScore, awaitingRole, signOut } = useAuth();

  if (loading) return <PageLoading label="Đang kiểm tra quyền truy cập..." />;

  if (!user) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader
          icon={<Lock className="h-5 w-5" />}
          title="Cần đăng nhập"
          description={
            required === "ADMIN"
              ? "Khu vực này dành cho Ban tổ chức."
              : "Khu vực này dành cho trọng tài và Ban tổ chức."
          }
        />
        <CardBody className="space-y-3">
          <p className="text-sm text-mute">
            Khán giả xem bảng điểm, lịch thi đấu và bảng xếp hạng không cần đăng nhập.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/login">
              <Button variant="primary">Đăng nhập</Button>
            </Link>
            <Link href="/scoreboard">
              <Button variant="ghost">Xem bảng điểm</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (awaitingRole) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Tài khoản chưa được cấp quyền"
          description="Ban tổ chức cần gán vai trò cho tài khoản này."
        />
        <CardBody className="space-y-3 text-sm text-mute">
          <p>
            Hãy báo BTC tạo hồ sơ trong mục Quản trị → Cài đặt, hoặc tạo document{" "}
            <code className="rounded bg-subtle px-1.5 py-0.5 text-body">users/&lt;uid&gt;</code>{" "}
            trong Firestore với trường <code className="rounded bg-subtle px-1.5 py-0.5">role</code>.
          </p>
          <Button variant="ghost" onClick={() => void signOut()}>
            Đăng xuất
          </Button>
        </CardBody>
      </Card>
    );
  }

  const allowed = required === "ADMIN" ? isAdmin : canScore;
  if (!allowed) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Không đủ quyền"
          description="Chức năng này chỉ dành cho Ban tổ chức (ADMIN)."
        />
        <CardBody className="flex flex-wrap gap-2">
          <Link href="/referee">
            <Button variant="primary">Về màn hình trọng tài</Button>
          </Link>
          <Button variant="ghost" onClick={() => void signOut()}>
            Đăng xuất
          </Button>
        </CardBody>
      </Card>
    );
  }

  return <>{children}</>;
}
