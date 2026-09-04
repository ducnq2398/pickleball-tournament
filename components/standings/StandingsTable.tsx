"use client";

/**
 * Bảng xếp hạng của một bảng đấu.
 * Dữ liệu được TÍNH từ matches (lib/tournament/standings) chứ không lưu DB.
 */
import { Trophy } from "lucide-react";
import type { StandingRow } from "@/types/tournament";
import { cn, formatDiff } from "@/lib/utils";

export function StandingsTable({
  rows,
  qualificationSlots = 0,
  complete = false,
  highlightTeamId,
}: {
  rows: StandingRow[];
  qualificationSlots?: number;
  complete?: boolean;
  highlightTeamId?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-faint">Bảng chưa có đội nào.</p>;
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-mute">
            <th className="w-10 pb-2 pl-2 font-medium">#</th>
            <th className="pb-2 font-medium">Đội</th>
            <th className="w-12 pb-2 text-center font-medium" title="Số trận đã đấu">
              Tr
            </th>
            <th className="w-12 pb-2 text-center font-medium" title="Thắng">
              T
            </th>
            <th className="w-12 pb-2 text-center font-medium" title="Thua">
              B
            </th>
            <th className="w-14 pb-2 text-center font-medium" title="Điểm ghi được">
              Ghi
            </th>
            <th className="w-14 pb-2 text-center font-medium" title="Điểm bị ghi">
              Thủng
            </th>
            <th className="w-14 pb-2 pr-2 text-center font-medium" title="Hiệu số">
              HS
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const qualified = qualificationSlots > 0 && row.rank <= qualificationSlots;
            return (
              <tr
                key={row.teamId}
                className={cn(
                  "border-t border-line/60",
                  qualified && "bg-brand-500/5",
                  highlightTeamId === row.teamId && "bg-info-500/10",
                )}
              >
                <td className="py-2.5 pl-2">
                  <span
                    className={cn(
                      "tabular inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold",
                      qualified ? "bg-brand-500 text-white" : "bg-fill text-body",
                    )}
                  >
                    {row.rank}
                  </span>
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-strong">{row.teamName}</span>
                    {qualified && complete ? (
                      <Trophy className="h-3.5 w-3.5 shrink-0 text-brand-400" />
                    ) : null}
                  </div>
                  {row.tiebreakReason ? (
                    <span className="text-xs text-faint">Phân định: {row.tiebreakReason}</span>
                  ) : null}
                </td>
                <td className="tabular py-2.5 text-center text-body">{row.played}</td>
                <td className="tabular py-2.5 text-center font-semibold text-brand-400">{row.won}</td>
                <td className="tabular py-2.5 text-center text-mute">{row.lost}</td>
                <td className="tabular py-2.5 text-center text-body">{row.scoreFor}</td>
                <td className="tabular py-2.5 text-center text-mute">{row.scoreAgainst}</td>
                <td
                  className={cn(
                    "tabular py-2.5 pr-2 text-center font-semibold",
                    row.diff > 0 ? "text-brand-400" : row.diff < 0 ? "text-live-400" : "text-body",
                  )}
                >
                  {formatDiff(row.diff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
