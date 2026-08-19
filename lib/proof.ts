/**
 * Doom Eradicators — proof links attached to a tile.
 *
 * Every rule about a proof row lives here, so the popup that types them and the
 * server action that stores them share one implementation. That matters twice: the
 * popup can only disable SAVE for exactly the rows the server would reject, and
 * vitest.config.ts collects lib/**\/*.test.ts only, so a rule outside lib/ is a rule
 * nothing tests.
 *
 * Client-safe: no imports at all, and nothing here touches the DOM or the database.
 */

export const PROOF_TITLE_MAX = 80;
export const PROOF_URL_MAX = 500;
/** Per tile. Enforced here rather than in SQL, because a cap needs a trigger. */
export const PROOF_MAX_ROWS = 12;

export interface ProofLink {
  /** uuid, minted client-side so the optimistic rows ARE the rows the server stores */
  id: string;
  title: string;
  url: string;
  /** display position within the tile, 0-based and contiguous */
  ord: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for the uuid shape the client mints and the DB stores. */
export function isProofId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * crypto.randomUUID() where it exists (every browser this app supports, and Node 19+),
 * with a hand-rolled v4 fallback so a stray non-secure context can't crash a save.
 */
function newId(): string {
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else {
      const r = Math.floor(Math.random() * 16);
      out += hex[i === 19 ? (r & 0x3) | 0x8 : r];
    }
  }
  return out;
}

/** Blank editor row with a fresh id. */
export function blankProofRow(): ProofLink {
  return { id: newId(), title: "", url: "", ord: 0 };
}

/**
 * The one URL rule.
 *
 * http/https only — and note that new URL() happily PARSES "javascript:alert(1)", so
 * the protocol allow-list is the actual defence, not the parse. A bare host gets
 * https:// prepended, because people paste "imgur.com/a/x". Over-length is rejected
 * rather than truncated: a truncated URL is a broken link, and silently storing one
 * would be worse than saying no.
 *
 * Returns null when the string isn't a usable link.
 */
export function normaliseProofUrl(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;

  // Protocol-relative and bare-host pastes. Checked BEFORE parsing, because
  // new URL("imgur.com/a/x") throws while new URL("javascript:x") does not.
  if (s.startsWith("//")) s = "https:" + s;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname) return null;
  // A hostname with no dot is either localhost or a typo; neither is proof anybody
  // else can open.
  if (!u.hostname.includes(".")) return null;
  // Whitespace anywhere would break the SQL check constraint on the column.
  if (/\s/.test(u.href)) return null;
  if (u.href.length > PROOF_URL_MAX) return null;
  return u.href;
}

/** Host without "www.", for the secondary line and the title fallback. "" if unparseable. */
export function proofHost(url: string): string {
  const href = normaliseProofUrl(url);
  if (!href) return "";
  try {
    return new URL(href).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/**
 * The save rule, run by BOTH the popup (to disable SAVE and flag bad rows) and the
 * server action (because the client is untrusted and the two must agree about what a
 * valid list is).
 *
 * Trims; drops rows with no URL; rejects non-http(s); slices the title to
 * PROOF_TITLE_MAX; de-dupes by normalised URL keeping the first; caps at
 * PROOF_MAX_ROWS; renumbers ord from 0; and replaces a missing or malformed id with a
 * fresh uuid so the delete-what's-gone filter in setTileProofs is always well-formed.
 */
export function cleanProofRows(rows: readonly Partial<ProofLink>[]): ProofLink[] {
  if (!Array.isArray(rows)) return [];
  const out: ProofLink[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r) continue;
    const url = normaliseProofUrl(typeof r.url === "string" ? r.url : "");
    if (!url) continue;
    // Case-insensitive host, case-sensitive path — so the de-dupe key is the
    // normalised href, which new URL() has already lower-cased the host of.
    if (seen.has(url)) continue;
    seen.add(url);
    const title = (typeof r.title === "string" ? r.title : "").trim().slice(0, PROOF_TITLE_MAX);
    out.push({ id: isProofId(r.id) ? r.id : newId(), title, url, ord: out.length });
    if (out.length >= PROOF_MAX_ROWS) break;
  }
  return out;
}
