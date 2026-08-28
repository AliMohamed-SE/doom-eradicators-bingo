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
import { completionAfter } from "@/lib/scoring";
import { rivalDone } from "@/lib/rival";
import type { EventState, Intent } from "@/lib/scoring";
import type { RivalBoardState } from "@/lib/rival";
import type { ProofLink } from "@/lib/proof";

type Drawer =
  | { kind: "tile"; id: string }
  | { kind: "region"; id: string }
  | { kind: "planpick"; id: string }
  // Compare has no id: there is only ever one rival board, and the sheet reads
  // both done-sets straight off this provider.
  | { kind: "compare" }
  | null;

interface AppContextValue {
  me: PlayerRow | null;
  userId: string | null;
  players: PlayerRow[];
  isLeader: boolean;
  canBeLeader: boolean;
  state: EventState;
  completionMeta: AppSnapshot["completionMeta"];
  /**
   * The tracked rival board, or null when tracking is off. Null hides the RIVAL
   * tab and the COMPARE button; it is the feature's only switch.
   */
  rival: RivalBoardState | null;
  /** the rival's completed tiles, in the shape every lib/scoring function takes */
  rivalDone: ReadonlySet<string>;
  /**
   * Tables that failed to load server-side. Non-empty means everything else on
   * this context is incomplete — components/load-warning.tsx is what says so.
   */
  failedReads: string[];
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
  openCompare: () => void;
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
  const rivalDoneSet = useMemo(() => rivalDone(snapshot.rival), [snapshot.rival]);

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
    rival: snapshot.rival,
    rivalDone: rivalDoneSet,
    failedReads: snapshot.failedReads,
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
    openCompare: () => setDrawer({ kind: "compare" }),
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

/**
 * Mirrors logProgress on the server, including the clamp at both ends and the
 * sticky completion rule — the shared completionAfter() is why the two cannot
 * drift into disagreeing about whether a tile is done.
 */
export function patchProgress(uid: string, tileId: string, delta: number, goal: number) {
  return (s: AppSnapshot): AppSnapshot => {
    const row = { ...(s.state.progress[tileId] ?? {}) };
    const next = Math.min(goal, Math.max(0, (row[uid] ?? 0) + delta));
    if (next === 0) delete row[uid];
    else row[uid] = next;
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    const doneIds = new Set(s.state.doneIds);
    const claims = { ...s.state.claims };
    if (completionAfter(doneIds.has(tileId), total, goal)) {
      doneIds.add(tileId);
      delete claims[tileId];
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

/** The shared free-text note on a tile. */
export function patchNote(tileId: string, note: string) {
  return (s: AppSnapshot): AppSnapshot => {
    const notes = { ...s.state.notes };
    if (note) notes[tileId] = note;
    else delete notes[tileId];
    return { ...s, state: { ...s.state, notes } };
  };
}

/**
 * The whole proof list on a target, replaced in one go — which is exactly what the
 * editor saves.
 *
 * Optimism here is cheap and safe in a way patchProgress is not: there is no shared
 * rule to keep in step with the server, just an assignment of the payload that was
 * sent. Row ids are minted client-side precisely so these are the rows the server
 * stores, which means the following router.refresh() replaces the list with an
 * identical one instead of churning the DOM. Worth doing because the leader has just
 * typed this content and will look for it the instant the popup closes.
 */
export function patchProofs(tileId: string, rows: ProofLink[]) {
  return (s: AppSnapshot): AppSnapshot => {
    const proofs = { ...s.state.proofs };
    if (rows.length) proofs[tileId] = rows;
    else delete proofs[tileId];
    return { ...s, state: { ...s.state, proofs } };
  };
}

/**
 * A leader's whole-target contribution edit, applied in one go.
 *
 * `counts` is the complete player -> count map the target should end up with, which
 * is what both setTileContribs (typed numbers) and setTileItemOwners (numbers
 * recounted from ticks) leave behind — the editor works out which of those it is,
 * because it is the side that knows whether the numbers grid was in play. `owners`
 * is the new box map, omitted on a target with no boxes.
 *
 * Not layered on patchProgress: that one moves ONE player by a delta, and this
 * replaces the whole breakdown. It still routes completion through the shared
 * completionAfter, which is what keeps it from disagreeing with the server about
 * whether the edit finished the tile.
 */
export function patchContribs(
  tileId: string,
  next: { counts: Record<string, number>; owners?: Record<string, string> },
  goal: number,
) {
  return (s: AppSnapshot): AppSnapshot => {
    const row: Record<string, number> = {};
    for (const [pid, n] of Object.entries(next.counts)) if (n > 0) row[pid] = n;
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    const doneIds = new Set(s.state.doneIds);
    const claims = { ...s.state.claims };
    if (completionAfter(doneIds.has(tileId), total, goal)) {
      doneIds.add(tileId);
      delete claims[tileId];
    }
    return {
      ...s,
      state: {
        ...s.state,
        progress: { ...s.state.progress, [tileId]: row },
        items: next.owners ? { ...s.state.items, [tileId]: next.owners } : s.state.items,
        doneIds: [...doneIds],
        claims,
      },
    };
  };
}

/**
 * Ticking or unticking one checklist box. Layered on patchProgress so the
 * completion rule lives in exactly one place.
 *
 * `ownerUid` is whose count moves, which is NOT the caller when a leader clears
 * somebody else's tick. `weight` is 1 for a normal item and the whole goal for an
 * `alt` box. This patch is not optional: run() only feels instant because of it,
 * and with no tap-highlight in this skin an un-patched tick looks broken and gets
 * double-tapped.
 */
export function patchItem(
  ownerUid: string,
  tileId: string,
  itemKey: string,
  on: boolean,
  weight: number,
  goal: number,
) {
  return (s: AppSnapshot): AppSnapshot => {
    const base = patchProgress(ownerUid, tileId, on ? weight : -weight, goal)(s);
    const row = { ...(base.state.items[tileId] ?? {}) };
    if (on) row[itemKey] = ownerUid;
    else delete row[itemKey];
    return {
      ...base,
      state: { ...base.state, items: { ...base.state.items, [tileId]: row } },
    };
  };
}

// ---------------------------------------------------------------------------
// Rival board patches.
//
// Much simpler than the ones above, because the rival board is much simpler: no
// goal, no contributors, no sticky completion. A mark is a set membership, so the
// patch is a set membership — there is no shared rule for these to keep in step
// with, only the assignment the action is about to make.
//
// They are not optional, for the same reason patchItem isn't: this skin has no
// tap-highlight, and a leader ticking their way through a screenshot needs each
// tap to land before the round trip or they tap it again.
// ---------------------------------------------------------------------------

/** One tile marked or unmarked on the rival board. No-op when tracking is off. */
export function patchRivalTile(tileId: string, done: boolean) {
  return (s: AppSnapshot): AppSnapshot => {
    if (!s.rival) return s;
    const ids = new Set(s.rival.doneIds);
    if (done) ids.add(tileId);
    else ids.delete(tileId);
    return { ...s, rival: { ...s.rival, doneIds: [...ids] } };
  };
}

/** A whole region marked or cleared at once, mirroring setRivalRegion. */
export function patchRivalRegion(tileIds: readonly string[], done: boolean) {
  return (s: AppSnapshot): AppSnapshot => {
    if (!s.rival) return s;
    const ids = new Set(s.rival.doneIds);
    tileIds.forEach((id) => (done ? ids.add(id) : ids.delete(id)));
    return { ...s, rival: { ...s.rival, doneIds: [...ids] } };
  };
}

/** The board's name, typed by a leader and echoed straight back into the header. */
export function patchRivalName(name: string) {
  return (s: AppSnapshot): AppSnapshot =>
    s.rival ? { ...s, rival: { ...s.rival, name } } : s;
}
