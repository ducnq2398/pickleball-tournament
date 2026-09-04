/**
 * Chuẩn hoá lỗi: mọi lỗi Firebase/nghiệp vụ đều được dịch sang câu tiếng Việt
 * mà BTC và trọng tài đọc hiểu được. UI chỉ việc hiển thị `message`.
 */
import { FirebaseError } from "firebase/app";
import { FirebaseNotConfiguredError } from "@/lib/firebase";
import type { ValidationResult } from "@/types/tournament";

export class AppError extends Error {
  readonly code: string;
  constructor(message: string, code = "app/error") {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

const FIREBASE_MESSAGES: Record<string, string> = {
  "permission-denied":
    "Không có quyền truy cập dữ liệu. Nếu vừa cài đặt dự án, hãy deploy firestore.rules " +
    "(xem README); nếu đang thao tác quản trị, hãy đăng nhập bằng tài khoản có vai trò phù hợp.",
  unauthenticated: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  unavailable: "Mất kết nối tới máy chủ. Kiểm tra Internet rồi thử lại.",
  "deadline-exceeded": "Máy chủ phản hồi quá chậm. Vui lòng thử lại.",
  "not-found": "Không tìm thấy dữ liệu (có thể đã bị xoá).",
  aborted: "Có người khác vừa cập nhật cùng lúc. Vui lòng thử lại.",
  "failed-precondition": "Dữ liệu đã thay đổi, thao tác không còn hợp lệ.",
  cancelled: "Thao tác đã bị huỷ.",
  "resource-exhausted": "Vượt hạn mức Firestore. Vui lòng thử lại sau.",
  "invalid-argument": "Dữ liệu gửi lên không hợp lệ.",
  "auth/invalid-email": "Email không hợp lệ.",
  "auth/user-not-found": "Tài khoản không tồn tại.",
  "auth/wrong-password": "Sai mật khẩu.",
  "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
  "auth/too-many-requests": "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.",
  "auth/network-request-failed": "Không có kết nối mạng.",
};

/** Câu thông báo thân thiện cho bất kỳ lỗi nào. */
export function toFriendlyMessage(error: unknown): string {
  if (error instanceof FirebaseNotConfiguredError) return error.message;
  if (error instanceof AppError) return error.message;

  if (error instanceof FirebaseError) {
    const short = error.code.replace(/^firestore\//, "");
    return FIREBASE_MESSAGES[short] ?? FIREBASE_MESSAGES[error.code] ?? `Lỗi Firebase: ${error.code}`;
  }
  if (error instanceof Error) return error.message;
  return "Đã xảy ra lỗi không xác định.";
}

/** Ném lỗi nếu kết quả validate không hợp lệ. */
export function assertValid(result: ValidationResult, fallback = "Thao tác không hợp lệ."): void {
  if (result.ok) return;
  throw new AppError(result.errors.join(" ") || fallback, "app/invalid");
}
