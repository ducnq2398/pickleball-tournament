"use client";

/**
 * Trạng thái đăng nhập + vai trò, chia sẻ cho toàn app.
 *
 * PUBLIC không cần đăng nhập: provider vẫn chạy nhưng user = null và mọi trang
 * công khai hoạt động bình thường.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppUser, UserRole } from "@/types/tournament";
import { isFirebaseConfigured } from "@/lib/firebase";
import { signIn as firebaseSignIn, signOutCurrentUser, watchAuthState, type User } from "@/lib/auth";
import { watchUserProfile } from "@/lib/firestore/users";

interface AuthContextValue {
  user: User | null;
  profile: AppUser | null;
  role: UserRole | null;
  isAdmin: boolean;
  isReferee: boolean;
  /** Được phép nhập điểm: admin hoặc trọng tài. */
  canScore: boolean;
  loading: boolean;
  /** Đã đăng nhập nhưng chưa được cấp vai trò. */
  awaitingRole: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  actor: { userId?: string; userName?: string };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      return;
    }
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = watchAuthState((nextUser) => {
        setUser(nextUser);
        setLoading(false);
      });
    } catch (error) {
      console.error("[auth] Không khởi tạo được Firebase Auth:", error);
      setLoading(false);
    }
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const unsubscribe = watchUserProfile(
      user.uid,
      (next) => {
        setProfile(next);
        setProfileLoading(false);
      },
      (error) => {
        console.warn("[auth] Không đọc được hồ sơ vai trò:", error);
        setProfileLoading(false);
      },
    );
    return () => unsubscribe();
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    await firebaseSignIn(email, password);
  }, []);

  const signOut = useCallback(async () => {
    await signOutCurrentUser();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role = profile?.role ?? null;
    return {
      user,
      profile,
      role,
      isAdmin: role === "ADMIN",
      isReferee: role === "REFEREE",
      canScore: role === "ADMIN" || role === "REFEREE",
      loading: loading || profileLoading,
      awaitingRole: !!user && !profileLoading && !profile,
      signIn,
      signOut,
      actor: {
        userId: user?.uid,
        userName: profile?.name ?? user?.email ?? undefined,
      },
    };
  }, [user, profile, loading, profileLoading, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth phải nằm trong <AuthProvider>.");
  return context;
}
