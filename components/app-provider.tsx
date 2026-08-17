"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import type { AppSnapshot, PlayerRow } from "@/lib/types";
import { toEventState } from "@/lib/types";
import type { EventState, Intent } from "@/lib/scoring";

type Drawer =
  | { kind: "tile"; id: string }
  | { kind: "region"; id: string }
  | { kind: "planpick"; id: string }
  | null;

interface AppContextValue {
  me: PlayerRow | null;
  userId: string | null;
  players: PlayerRow[];
  isLeader: boolean;
  canBeLeader: boolean;
  state: EventState;
  completionMeta: AppSnapshot["completionMeta"];
  playerName: (id: string | null | undefined) => string;
  playerById: (id: string) => PlayerRow | undefined;

  // selected region (phone single-region view), persisted across tabs
  region: string;
  selectRegion: (id: string) => void;

  // planning: whose answers the planning board shows. Leaders can point this at
  // any linked seat to inspect that player's picks; everyone else sees their own.
  /** the player being inspected, or null when the board shows your own answers */
  planViewing: PlayerRow | null;
  /** resolved player id the planning board reads intents for */
  planUid: string;
  setPlanViewUid: (id: string | null) => void;

  // drawers
  drawer: Drawer;
  openTile: (id: string) => void;
  openRegion: (id: string) => void;
  openPlanPick: (id: string) => void;
  closeDrawer: () => void;

  pending: boolean;
  run: (fn: () => Promise<unknown>, optimistic?: (s: AppSnapshot) => AppSnapshot) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({
  initial,
  children,
}: {
  initial: AppSnapshot;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [region, setRegion] = useState("central");
  const [planViewUid, setPlanViewUid] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [pending, startTransition] = useTransition();

  // When the server sends fresh data (after a mutation or a realtime refresh),
  // adopt it as authoritative — this clears any optimistic overlay.
  useEffect(() => {
    setSnapshot(initial);
  }, [initial]);

  const state = useMemo(() => toEventState(snapshot.state), [snapshot.state]);

  const byId = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    snapshot.players.forEach((p) => m.set(p.id, p));
    return m;
  }, [snapshot.players]);

  const playerName = useCallback(
    (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? id) : ""),
    [byId],
  );
  const playerById = useCallback((id: string) => byId.get(id), [byId]);

  // Only leaders may inspect someone else, and never "inspect" your own seat.
  const planViewing =
    snapshot.isLeader && planViewUid && planViewUid !== snapshot.me?.id
      ? (byId.get(planViewUid) ?? null)
      : null;
  const planUid = planViewing?.id ?? snapshot.me?.id ?? "";

  const run = useCallback(
    (fn: () => Promise<unknown>, optimistic?: (s: AppSnapshot) => AppSnapshot) => {
      if (optimistic) setSnapshot((s) => optimistic(s));
      startTransition(async () => {
        await fn();
        router.refresh();
      });
    },
    [router],
  );

  const value: AppContextValue = {
    me: snapshot.me,
    userId: snapshot.me?.id ?? null,
    players: snapshot.players,
    isLeader: snapshot.isLeader,
    canBeLeader: snapshot.canBeLeader,
    state,
    completionMeta: snapshot.completionMeta,
    playerName,
    playerById,
    region,
    selectRegion: setRegion,
    planViewing,
    planUid,
    setPlanViewUid,
    drawer,
    openTile: (id) => setDrawer({ kind: "tile", id }),
    openRegion: (id) => setDrawer({ kind: "region", id }),
    openPlanPick: (id) => setDrawer({ kind: "planpick", id }),
    closeDrawer: () => setDrawer(null),
    pending,
    run,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ---------------------------------------------------------------------------
// Optimistic snapshot patch helpers (used by interactive components).
// ---------------------------------------------------------------------------
export function patchClaim(uid: string, tileId: string, on: boolean) {
  return (s: AppSnapshot): AppSnapshot => {
    const list = new Set(s.state.claims[tileId] ?? []);
    if (on) list.add(uid);
    else list.delete(uid);
    return {
      ...s,
      state: { ...s.state, claims: { ...s.state.claims, [tileId]: [...list] } },
    };
  };
}

export function patchIntent(uid: string, tileId: string, intent: Intent | null) {
  return (s: AppSnapshot): AppSnapshot => {
    const row = { ...(s.state.intents[tileId] ?? {}) };
    if (intent === null) delete row[uid];
    else row[uid] = intent;
    return {
      ...s,
      state: { ...s.state, intents: { ...s.state.intents, [tileId]: row } },
    };
  };
}

export function patchProgress(uid: string, tileId: string, delta: number, goal: number) {
  return (s: AppSnapshot): AppSnapshot => {
    const row = { ...(s.state.progress[tileId] ?? {}) };
    const next = Math.max(0, (row[uid] ?? 0) + delta);
    if (next === 0) delete row[uid];
    else row[uid] = next;
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    const doneIds = new Set(s.state.doneIds);
    const claims = { ...s.state.claims };
    if (total >= goal) {
      doneIds.add(tileId);
      delete claims[tileId];
    } else {
      doneIds.delete(tileId);
    }
    return {
      ...s,
      state: {
        ...s.state,
        progress: { ...s.state.progress, [tileId]: row },
        doneIds: [...doneIds],
        claims,
      },
    };
  };
}
