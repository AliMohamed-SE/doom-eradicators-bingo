// Client-safe shared types. No server-only imports here so both server and
// client components can use them.
import type { RareId } from "./board-data";
import type { ProofLink } from "./proof";
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
