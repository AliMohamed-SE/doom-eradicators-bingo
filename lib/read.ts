/**
 * Doom Eradicators — one database read, retried, and honest about failing.
 *
 * THE TRAP THIS EXISTS FOR. supabase-js RESOLVES a failed read rather than
 * throwing, so the natural `const rows = result.data ?? []` turns a network blip, a
 * cold connection, a PostgREST 5xx or an unapplied migration into an EMPTY result —
 * and for this app an empty tile_completions renders as a perfectly healthy board
 * on which nobody has finished anything. The failure has no symptom except being
 * wrong, and reloading "fixes" it, which is precisely how it goes unreported.
 *
 * Two rules, both of which the caller depends on:
 *   1. retry once — transient failures are the common case and a second attempt a
 *      moment later usually lands, which is a real fix and not just a report;
 *   2. if it still fails, name the table — so the caller can tell the reader the
 *      board is INCOMPLETE instead of quietly showing them a wrong one.
 *
 * Lives in lib/ and imports nothing, so vitest can reach it: lib/data.ts is
 * `server-only` and cannot be imported from a test, and vitest.config.ts collects
 * lib/ only — a rule outside it is a rule nothing tests.
 */

/** What the caller gets back: the rows, or the name of the table that failed. */
export interface ReadOutcome<T> {
  data: T | null;
  /** the table name when both attempts failed, null on success */
  failed: string | null;
}

/** The shape of any supabase-js result, narrowed to the two fields that matter. */
export interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface ReadOptions {
  /** total attempts, including the first. Default 2. */
  attempts?: number;
  /** pause between attempts, ms. Default 120. */
  delayMs?: number;
  /** where a final failure is reported. Default console.error. */
  log?: (message: string, detail: string) => void;
  /** injectable sleep, so tests do not actually wait */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `query`, retrying once on failure, and report the table name if it never
 * succeeds.
 *
 * Takes a FACTORY rather than a query, because a supabase query builder is
 * thenable and single-use — re-awaiting the same one does not re-run it, so a
 * retry that reused the builder would silently be no retry at all.
 *
 * `hint` is the migration to check, for the failures that mean an unapplied one.
 */
export async function read<T>(
  table: string,
  hint: string,
  query: () => PromiseLike<QueryResult<T>>,
  opts: ReadOptions = {},
): Promise<ReadOutcome<T>> {
  const attempts = Math.max(1, opts.attempts ?? 2);
  const delayMs = opts.delayMs ?? 120;
  const sleep = opts.sleep ?? wait;
  const log = opts.log ?? ((m: string, d: string) => console.error(m, d));

  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // A throw is a failure like any other — a DNS error or an aborted socket
    // rejects instead of resolving, and it deserves the same retry as a 5xx.
    let result: QueryResult<T>;
    try {
      result = await query();
    } catch (e) {
      result = { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
    if (!result.error) return { data: result.data, failed: null };
    last = result.error.message;
    if (attempt < attempts) await sleep(delayMs);
  }

  log(`read ${table} failed${hint ? ` (${hint})` : ""}:`, last);
  return { data: null, failed: table };
}
