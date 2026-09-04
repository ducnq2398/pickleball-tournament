/**
 * SEED DATA — tạo giải mẫu đầy đủ chỉ bằng một cú bấm (§42).
 *
 * Đúng cấu hình của giải thật: 9 đội, 2 bảng (5 + 4), 2 sân,
 * vòng bảng chạm 11, knockout chạm 15 → 16 trận vòng bảng.
 */
import { createTournamentConfig } from "@/lib/tournament/tournament";
import { createTournamentWithData } from "./bootstrap";
import type { AuditActor } from "./auditLogs";

const SAMPLE_TEAMS: { name: string; players: [string, string] }[] = [
  { name: "Sài Gòn Smash", players: ["Nguyễn Văn An", "Trần Minh Bảo"] },
  { name: "Hà Nội Dinker", players: ["Lê Quốc Cường", "Phạm Thu Dung"] },
  { name: "Đà Nẵng Rally", players: ["Hoàng Anh Đức", "Vũ Thị Én"] },
  { name: "Cần Thơ Volley", players: ["Đỗ Gia Phúc", "Bùi Hải Giang"] },
  { name: "Huế Kitchen", players: ["Ngô Thanh Hà", "Đinh Công Huy"] },
  { name: "Nha Trang Ace", players: ["Trịnh Khánh Linh", "Lý Gia Khiêm"] },
  { name: "Hải Phòng Drive", players: ["Mai Trung Kiên", "Chu Bảo Lâm"] },
  { name: "Vũng Tàu Lob", players: ["Phan Mỹ Lệ", "Tạ Văn Minh"] },
  { name: "Bình Dương Spin", players: ["Đặng Hoài Nam", "Hồ Ngọc Oanh"] },
];

export interface SeedOptions {
  name?: string;
  /** Bắt đầu luôn vòng bảng (mặc định có) để test realtime ngay. */
  startImmediately?: boolean;
}

export async function seedSampleTournament(
  options: SeedOptions = {},
  actor?: AuditActor,
): Promise<string> {
  const result = await createTournamentWithData(
    {
      name: options.name?.trim() || `Giải Pickleball ${new Date().getFullYear()}`,
      date: new Date().toISOString().slice(0, 10),
      location: "Nhà thi đấu Pickleball",
      config: createTournamentConfig({ numberOfTeams: SAMPLE_TEAMS.length }),
      teams: SAMPLE_TEAMS.map((team) => ({ name: team.name, playerNames: [...team.players] })),
      generateSchedule: true,
      startImmediately: options.startImmediately !== false,
    },
    actor,
  );
  return result.tournamentId;
}
