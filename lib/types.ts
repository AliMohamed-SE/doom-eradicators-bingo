// Client-safe shared types. No server-only imports here so both server and
// client components can use them.
import type { RareId } from "./board-data";
import type { ProofLink } from "./proof";
import type { RivalBoardState } from "./rival";
import type { EventState, Intent } from "./scoring";

export interface PlayerRow {
  id: string;
  name: string;
  is_leader: boolean;
  rares: RareId[];
  task: string;
  /** whether a Discord account is currently linked to this seat */
  linked: boolean;
}

export interface CompletionMeta {
  completedAt: string | null;
  completedBy: string | null;
}

/** Serializable event state for crossing the server -> client boundary (no Set). */
export interface SerializableState {
  claims: Record<string, string[]>;
  progress: Record<string, Record<string, number>>;
  /** tileId -> itemKey -> playerId who ticked that checklist box */
  items: Record<string, Record<string, string>>;
  /** tileId -> shared free-text note */
  notes: Record<string, string>;
  /** tileId -> leader-attached proof links, in display order */
  proofs: Record<string, ProofLink[]>;
  doneIds: string[];
  intents: Record<string, Record<string, Intent>>;
  focusRegions: string[];
  focusTiles: string[];
}

export interface AppSnapshot {
  me: PlayerRow | null;
  /** designated leader AND this device entered the leader code */
  isLeader: boolean;
  /** the current character is a designated leader (may still need the code) */
  canBeLeader: boolean;
  players: PlayerRow[];
  completionMeta: Record<string, CompletionMeta>;
  state: SerializableState;
  /**
   * The rival board, or null when no leader has set tracking up. Null is what
   * hides the RIVAL tab from the team — see components/header.tsx. Already
   * serializable (its done-set is an id array), so it crosses the boundary as-is.
   */
  rival: RivalBoardState | null;
  /**
   * Tables whose read failed on the server. Non-empty means this snapshot is
   * INCOMPLETE, and the app must say so rather than render it as the truth —
   * see components/load-warning.tsx and the note on read() in lib/data.ts.
   */
  failedReads: string[];
}

/** Rebuild the runtime EventState (with a Set) on the client. */
export function toEventState(s: SerializableState): EventState {
  return {
    claims: s.claims,
    progress: s.progress,
    items: s.items,
    notes: s.notes,
    proofs: s.proofs,
    done: new Set(s.doneIds),
    intents: s.intents,
    focusRegions: s.focusRegions,
    focusTiles: s.focusTiles,
  };
}
