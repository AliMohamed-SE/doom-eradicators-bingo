import { describe, it, expect, vi } from "vitest";
import { read, type QueryResult } from "./read";

/** A query factory that returns the given results in order, one per call. */
function scripted<T>(...results: QueryResult<T>[]) {
  let i = 0;
  const calls: number[] = [];
  const query = () => {
    calls.push(++i);
    return Promise.resolve(results[Math.min(i - 1, results.length - 1)]);
  };
  return { query, calls };
}

const ok = <T,>(data: T): QueryResult<T> => ({ data, error: null });
const bad = (message: string): QueryResult<never> => ({ data: null, error: { message } });

/** No real waiting, and no console noise, in any of these. */
const fast = { delayMs: 0, sleep: async () => {}, log: () => {} };

describe("read", () => {
  it("returns the rows and does not retry when the first attempt succeeds", async () => {
    const { query, calls } = scripted(ok([{ tile_id: "a" }]));
    const out = await read("tile_completions", "", query, fast);
    expect(out.data).toEqual([{ tile_id: "a" }]);
    expect(out.failed).toBeNull();
    expect(calls).toHaveLength(1);
  });

  /*
   * The whole point. A transient failure is the common case, and a second attempt
   * a moment later usually lands — so this is a real fix, not just a report.
   */
  it("retries once and succeeds on the second attempt", async () => {
    const { query, calls } = scripted(bad("fetch failed"), ok([{ tile_id: "b" }]));
    const out = await read("tile_completions", "", query, fast);
    expect(out.data).toEqual([{ tile_id: "b" }]);
    expect(out.failed).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("gives up after the second failure and names the table", async () => {
    const { query, calls } = scripted(bad("boom"), bad("boom"));
    const out = await read("tile_progress", "", query, fast);
    expect(out.data).toBeNull();
    expect(out.failed).toBe("tile_progress");
    expect(calls).toHaveLength(2);
  });

  /*
   * The failure this whole module exists to prevent: `data` must be null, never
   * [], so the caller cannot mistake a broken read for an empty table.
   */
  it("never reports a failed read as empty data", async () => {
    const out = await read("tile_completions", "", () => Promise.resolve(bad("500")), fast);
    expect(out.data).not.toEqual([]);
    expect(out.data).toBeNull();
    expect(out.failed).toBeTruthy();
  });

  it("treats a thrown error like a resolved one, and still retries", async () => {
    let n = 0;
    const query = () => {
      n++;
      if (n === 1) return Promise.reject(new Error("socket hang up"));
      return Promise.resolve(ok([{ tile_id: "c" }]));
    };
    const out = await read("focus", "", query, fast);
    expect(out.data).toEqual([{ tile_id: "c" }]);
    expect(n).toBe(2);
  });

  it("reports a persistent throw rather than escaping to the caller", async () => {
    const out = await read(
      "focus",
      "",
      () => Promise.reject(new Error("dns")),
      fast,
    );
    expect(out.failed).toBe("focus");
    expect(out.data).toBeNull();
  });

  it("logs once, with the table, the hint and the last error", async () => {
    const log = vi.fn();
    await read("rival_board", "is migration 0008 applied?", () => Promise.resolve(bad("relation missing")), {
      ...fast,
      log,
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("rival_board");
    expect(log.mock.calls[0][0]).toContain("migration 0008");
    expect(log.mock.calls[0][1]).toBe("relation missing");
  });

  it("does not log at all when the read eventually succeeds", async () => {
    const log = vi.fn();
    const { query } = scripted(bad("blip"), ok([]));
    await read("players", "", query, { ...fast, log });
    expect(log).not.toHaveBeenCalled();
  });

  /*
   * maybeSingle() returns an object rather than an array, and "no row" is a
   * legitimate success — the rival board's whole feature switch is a null here,
   * so it must not be confused with a failure.
   */
  it("passes a null single-row result through as success, not failure", async () => {
    const out = await read<{ name: string }>(
      "rival_board",
      "",
      () => Promise.resolve<QueryResult<{ name: string }>>({ data: null, error: null }),
      fast,
    );
    expect(out.data).toBeNull();
    expect(out.failed).toBeNull();
  });

  it("honours a custom attempt count", async () => {
    const { query, calls } = scripted(bad("x"), bad("x"), ok([1]));
    const out = await read("players", "", query, { ...fast, attempts: 3 });
    expect(out.data).toEqual([1]);
    expect(calls).toHaveLength(3);
  });

  it("waits between attempts, using the injected sleep", async () => {
    const sleep = vi.fn(async () => {});
    const { query } = scripted(bad("x"), ok([]));
    await read("players", "", query, { ...fast, sleep, delayMs: 120 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(120);
  });

  it("does not sleep after the final attempt", async () => {
    const sleep = vi.fn(async () => {});
    await read("players", "", () => Promise.resolve(bad("x")), { ...fast, sleep, log: () => {} });
    // Two attempts, so exactly one gap between them.
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
