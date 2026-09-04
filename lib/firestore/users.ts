/**
 * Repository cho `users/{userId}` — nơi lưu VAI TRÒ.
 *
 * Quy ước bảo mật (khớp firestore.rules):
 * - Người dùng tự tạo hồ sơ của mình khi đăng nhập lần đầu, nhưng CHỈ được
 *   đặt role = "REFEREE". Không ai tự phong mình làm ADMIN.
 * - Chỉ ADMIN mới đổi được role của người khác.
 * - Admin đầu tiên phải được tạo thủ công trong Firebase Console (xem README).
 */
import {
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { AppUser, UserRole } from "@/types/tournament";
import { userDoc, usersCol } from "./paths";
import { clean, parseUser } from "./converters";

export function watchUserProfile(
  userId: string,
  onData: (profile: AppUser | null) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    userDoc(userId),
    (snapshot) => onData(snapshot.exists() ? parseUser(snapshot.id, snapshot.data()) : null),
    (error) => onError?.(error),
  );
}

export async function getUserProfile(userId: string): Promise<AppUser | null> {
  const snapshot = await getDoc(userDoc(userId));
  return snapshot.exists() ? parseUser(snapshot.id, snapshot.data()) : null;
}

/** Tạo hồ sơ trọng tài cho chính mình khi đăng nhập lần đầu. */
export async function ensureOwnProfile(
  userId: string,
  name: string,
  email?: string,
): Promise<void> {
  const existing = await getDoc(userDoc(userId));
  if (existing.exists()) return;
  await setDoc(
    userDoc(userId),
    clean({
      name,
      email,
      role: "REFEREE" satisfies UserRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
}

export function watchUsers(
  onData: (users: AppUser[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    query(usersCol(), orderBy("name", "asc")),
    (snapshot) => onData(snapshot.docs.map((d) => parseUser(d.id, d.data()))),
    (error) => onError?.(error),
  );
}

export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  await updateDoc(userDoc(userId), { role, updatedAt: serverTimestamp() });
}

export async function setUserCourt(userId: string, courtId?: string): Promise<void> {
  await updateDoc(userDoc(userId), {
    courtId: courtId ?? null,
    updatedAt: serverTimestamp(),
  });
}
