/**
 * Lớp mỏng bọc Firebase Authentication.
 *
 * Public scoreboard KHÔNG cần đăng nhập; chỉ Admin/Trọng tài mới cần.
 */
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { ensureOwnProfile } from "@/lib/firestore/users";

export type { User };

/** Đăng nhập bằng email/mật khẩu và bảo đảm có hồ sơ vai trò. */
export async function signIn(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

  const displayName = credential.user.displayName || credential.user.email || "Trọng tài";
  try {
    await ensureOwnProfile(credential.user.uid, displayName, credential.user.email ?? undefined);
  } catch (error) {
    // Không chặn đăng nhập nếu rules chưa cho tạo hồ sơ — admin sẽ tạo tay.
    console.warn("[auth] Không tạo được hồ sơ người dùng:", error);
  }
  return credential.user;
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}

export function watchAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}
