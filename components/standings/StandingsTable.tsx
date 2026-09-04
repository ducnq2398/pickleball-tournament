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
    <>
      {/* Điện thoại: bảng 8 cột không vừa màn hình và người xem không biết là
          cuộn ngang được -> đổi thành thẻ xếp dọc, vẫn đủ mọi chỉ số. */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => {
          const qualified = qualificationSlots > 0 && row.rank <= qualificationSlots;
          return (
            <li
              key={row.teamId}
              className={cn(
                "rounded-xl border px-3 py-2.5",
                qualified ? "border-brand-500/40 bg-brand-500/5" : "border-line bg-subtle/60",
                highlightTeamId === row.teamId && "border-info-500/50 bg-info-500/10",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "tabular inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                    qualified ? "bg-brand-500 text-white" : "bg-fill text-body",
                  )}
                >
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-strong">
                  {row.teamName}
                </span>
                {qualified && complete ? (
                  <Trophy className="h-4 w-4 shrink-0 text-brand-400" />
                ) : null}
                <span className="tabular shrink-0 text-sm font-bold text-brand-400">
                  {row.won}
                  <span className="font-normal text-mute">T</span>
                  <span className="mx-0.5 text-faint">/</span>
                  <span className="text-mute">{row.lost}B</span>
                </span>
              </div>

              <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-9 text-xs text-mute">
                <div className="flex gap-1">
                  <dt>Trận</dt>
                  <dd className="tabular font-medium text-body">{row.played}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Ghi</dt>
                  <dd className="tabular font-medium text-body">{row.scoreFor}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Thủng</dt>
                  <dd className="tabular font-medium text-body">{row.scoreAgainst}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Hiệu số</dt>
                  <dd
                    className={cn(
                      "tabular font-semibold",
                      row.diff > 0
                        ? "text-brand-400"
                        : row.diff < 0
                          ? "text-live-400"
                          : "text-body",
                    )}
                  >
                    {formatDiff(row.diff)}
                  </dd>
                </div>
              </dl>

              {row.tiebreakReason ? (
                <p className="mt-1 pl-9 text-xs text-faint">Phân định: {row.tiebreakReason}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Từ tablet trở lên mới đủ chỗ cho bảng đầy đủ. */}
      <div className="hidden overflow-x-auto sm:block">
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
    </>
  );
}
