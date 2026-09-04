"use client";

import Link from "next/link";
import { Crown, Medal, Trophy } from "lucide-react";
import type { Team } from "@/types/tournament";

export function ChampionBanner({
  champion,
  runnerUp,
  thirdPlace,
  showLink = true,
}: {
  champion?: Team;
  runnerUp?: Team;
  thirdPlace?: Team;
  showLink?: boolean;
}) {
  if (!champion) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-brand-500/50 bg-gradient-to-br from-brand-500/20 via-surface to-surface p-6 text-center sm:p-10">
      <Crown className="mx-auto h-10 w-10 text-brand-400" />
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.3em] text-brand-400">
        Nhà vô địch
      </p>
      <h2 className="mt-2 text-3xl font-black tracking-tight text-strong sm:text-5xl">
        {champion.name}
      </h2>
      {champion.players.length ? (
        <p className="mt-2 text-sm text-body sm:text-base">
          {champion.players.map((player) => player.name).join(" · ")}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
        {runnerUp ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-subtle/80 px-4 py-1.5 text-body">
            <Medal className="h-4 w-4 text-body" />
            Á quân: <strong className="font-semibold">{runnerUp.name}</strong>
          </span>
        ) : null}
        {thirdPlace ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-warn-500/40 bg-warn-500/10 px-4 py-1.5 text-warn-400">
            <Medal className="h-4 w-4" />
            Hạng 3: <strong className="font-semibold">{thirdPlace.name}</strong>
          </span>
        ) : null}
      </div>

      {showLink ? (
        <Link
          href="/champion"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-400"
        >
          <Trophy className="h-4 w-4" />
          Xem trang vinh danh
        </Link>
      ) : null}
    </div>
  );
}
