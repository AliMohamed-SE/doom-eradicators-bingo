import type { TileState, Intent } from "@/lib/scoring";

/**
 * Tile-state treatments as a plain variant map of class strings. This is the
 * single source of tile styling — components pick a key, never re-derive colours.
 */
export const SKIN: Record<TileState, { className: string; badge: string; badgeText: string }> = {
  locked: {
    className: "bg-tile-locked-bg border-tile-locked-border text-tile-locked-text",
    badge: "LOCKED",
    badgeText: "text-tile-locked-text",
  },
  available: {
    className: "bg-tile-available-bg border-tile-available-border text-tile-available-text",
    badge: "OPEN",
    badgeText: "text-tile-available-text",
  },
  working: {
    className: "bg-tile-working-bg border-tile-working-border text-tile-working-text",
    badge: "ON IT",
    badgeText: "text-tile-working-text",
  },
  done: {
    className: "bg-tile-done-bg border-tile-done-border text-tile-done-text",
    badge: "DONE",
    badgeText: "text-tile-done-text",
  },
};

/** Bridge button tone by state. */
export const BRIDGE_TONE: Record<"done" | "locked" | "open", { className: string; head: string }> = {
  done: { className: "border-green-border bg-green-bg text-green-text", head: "text-green-soft" },
  locked: {
    className: "border-tile-locked-border bg-tile-locked-bg text-tile-locked-text",
    head: "text-tile-locked-text",
  },
  open: { className: "border-orange bg-amber-btn text-amber-soft", head: "text-amber-text" },
};

/** Planning tile tone by the current player's own intent (or none). */
export const PLAN_TONE: Record<Intent | "none", { className: string; badge: string }> = {
  want: { className: "border-green-border bg-green-bg text-green-text", badge: "WANT" },
  ok: { className: "border-amber-border bg-amber-btn text-amber-soft", badge: "WILLING" },
  no: { className: "border-red-border bg-red-bg text-red-text", badge: "WON'T" },
  none: { className: "border-border-default bg-tile-available-bg text-ink-dim2", badge: "—" },
};

/** The three intent picker buttons, on vs off. */
export const INTENT_BTN: Record<Intent, { on: string; off: string; label: string }> = {
  want: {
    on: "border-green-border2 bg-green-bg2 text-green-text2",
    off: "border-border-default bg-surface-dark text-ink-dim",
    label: "WANT",
  },
  ok: {
    on: "border-amber-border bg-amber-btn text-amber-soft",
    off: "border-border-default bg-surface-dark text-ink-dim",
    label: "WILLING",
  },
  no: {
    on: "border-red-border bg-red-bg text-red-text",
    off: "border-border-default bg-surface-dark text-ink-dim",
    label: "WON'T",
  },
};
