"use client";

/**
 * MỘT nguồn dữ liệu realtime duy nhất cho toàn app.
 *
 * Tối ưu chi phí Firestore (§48): mỗi collection chỉ có ĐÚNG MỘT listener cho
 * cả trang, bất kể bao nhiêu component đang hiển thị. Các hook trong /hooks chỉ
 * đọc lại từ context này, không tự mở listener mới.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Court, Group, Match, Team, Tournament } from "@/types/tournament";
import { isFirebaseConfigured, missingFirebaseEnvKeys } from "@/lib/firebase";
import { toFriendlyMessage } from "@/lib/firestore/errors";
import { watchTournament, watchTournaments } from "@/lib/firestore/tournaments";
import { watchTeams } from "@/lib/firestore/teams";
import { watchGroups } from "@/lib/firestore/groups";
import { watchCourts } from "@/lib/firestore/courts";
import { watchMatches } from "@/lib/firestore/matches";

const STORAGE_KEY = "pickleball.activeTournamentId";

interface TournamentContextValue {
  configured: boolean;
  missingEnv: string[];

  tournaments: Tournament[];
  tournamentId: string | null;
  selectTournament: (id: string | null) => void;

  tournament: Tournament | null;
  teams: Team[];
  groups: Group[];
  matches: Match[];
  courts: Court[];

  loading: boolean;
  error: string | null;
  /** Dữ liệu đang đọc từ cache offline. */
  fromCache: boolean;
  /** Còn thay đổi chưa đẩy lên server. */
  hasPendingWrites: boolean;
}

const TournamentContext = createContext<TournamentContextValue | null>(null);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  /** Giải do người dùng chọn tường minh — không bị listener ghi đè. */
  const explicitSelectionRef = useRef<string | null>(null);

  // Khôi phục lựa chọn giải từ localStorage (chỉ là tiện ích UI, không phải DB).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setTournamentId(stored);
    } catch {
      /* localStorage bị chặn -> bỏ qua */
    }
  }, []);

  const selectTournament = useCallback((id: string | null) => {
    explicitSelectionRef.current = id;
    setTournamentId(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* bỏ qua */
    }
  }, []);

  // Danh sách giải
  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const unsubscribe = watchTournaments(
      (list) => {
        setTournaments(list);
        setLoading(false);
        setError(null);
        setTournamentId((current) => {
          if (current && list.some((t) => t.id === current)) return current;
          // Giải vừa tạo có thể chưa kịp lên danh sách (serverTimestamp đang chờ)
          // -> giữ nguyên lựa chọn tường minh thay vì nhảy về giải khác.
          if (current && explicitSelectionRef.current === current) return current;
          const fallback = list[0]?.id ?? null;
          try {
            if (fallback) window.localStorage.setItem(STORAGE_KEY, fallback);
          } catch {
            /* bỏ qua */
          }
          return fallback;
        });
      },
      (listenerError) => {
        setError(toFriendlyMessage(listenerError));
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [configured]);

  // Dữ liệu của giải đang chọn
  useEffect(() => {
    if (!configured || !tournamentId) {
      setTournament(null);
      setTeams([]);
      setGroups([]);
      setMatches([]);
      setCourts([]);
      return;
    }

    const onError = (listenerError: unknown) => setError(toFriendlyMessage(listenerError));

    const unsubscribers = [
      watchTournament(tournamentId, setTournament, onError),
      watchTeams(tournamentId, setTeams, onError),
      watchGroups(tournamentId, setGroups, onError),
      watchCourts(tournamentId, setCourts, onError),
      watchMatches(
        tournamentId,
        (list, cache, pending) => {
          setMatches(list);
          setFromCache(cache);
          setHasPendingWrites(pending);
        },
        onError,
      ),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [configured, tournamentId]);

  const value = useMemo<TournamentContextValue>(
    () => ({
      configured,
      missingEnv: configured ? [] : missingFirebaseEnvKeys(),
      tournaments,
      tournamentId,
      selectTournament,
      tournament,
      teams,
      groups,
      matches,
      courts,
      loading,
      error,
      fromCache,
      hasPendingWrites,
    }),
    [
      configured,
      tournaments,
      tournamentId,
      selectTournament,
      tournament,
      teams,
      groups,
      matches,
      courts,
      loading,
      error,
      fromCache,
      hasPendingWrites,
    ],
  );

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export function useTournamentContext(): TournamentContextValue {
  const context = useContext(TournamentContext);
  if (!context) throw new Error("useTournamentContext phải nằm trong <TournamentProvider>.");
  return context;
}
