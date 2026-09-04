/** Tiện ích dùng chung, thuần tuý, không phụ thuộc UI. */

/** Nối class Tailwind có điều kiện. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

let counter = 0;

/** Sinh id ổn định, không cần thư viện ngoài (crypto.randomUUID nếu có). */
export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Chuẩn hoá tên để so sánh trùng (bỏ dấu cách thừa, không phân biệt hoa thường). */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Khoá duy nhất cho một cặp đấu — A vs B và B vs A là cùng một trận. */
export function pairKey(teamAId: string, teamBId: string): string {
  return [teamAId, teamBId].sort().join("::");
}

/** Kẹp giá trị trong khoảng [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Ép về số nguyên không âm (dùng cho ô nhập điểm). */
export function toNonNegativeInt(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function formatDiff(diff: number): string {
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

/** Gom nhóm mảng theo khoá. */
export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** So sánh 2 tuple số, phần tử càng lớn càng tốt. */
export function compareTuples(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function tupleKey(tuple: number[]): string {
  return tuple.join("|");
}

/** Chia mảng thành các đoạn nhỏ (Firestore batch tối đa 500 thao tác). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/** So sánh 2 mảng string không quan tâm thứ tự phần tử. */
export function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}
