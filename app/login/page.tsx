"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LogIn } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { PageLoading } from "@/components/ui/States";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { toFriendlyMessage } from "@/lib/firestore/errors";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn, user, isAdmin, signOut } = useAuth();
  const { notify } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = params.get("next");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      notify("Đăng nhập thành công.", "success");
      router.push(next || "/referee");
    } catch (signInError) {
      setError(toFriendlyMessage(signInError));
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader title="Đã đăng nhập" description={user.email ?? undefined} />
        <CardBody className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => router.push(isAdmin ? "/admin" : "/referee")}>
            {isAdmin ? "Vào trang quản trị" : "Vào màn hình trọng tài"}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Đăng xuất
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader
        icon={<LogIn className="h-5 w-5" />}
        title="Đăng nhập"
        description="Dành cho Ban tổ chức và trọng tài."
      />
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="trongtai@example.com"
            />
          </Field>
          <Field label="Mật khẩu" error={error ?? undefined}>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            Đăng nhập
          </Button>
          <p className="text-center text-xs text-faint">
            Khán giả không cần đăng nhập để xem bảng điểm và bảng xếp hạng.
          </p>
        </form>
      </CardBody>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <AppShell>
      <Suspense fallback={<PageLoading />}>
        <LoginForm />
      </Suspense>
    </AppShell>
  );
}
