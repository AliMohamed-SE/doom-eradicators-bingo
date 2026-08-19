import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  normaliseProofUrl,
  proofHost,
  isProofId,
  blankProofRow,
  cleanProofRows,
  PROOF_TITLE_MAX,
  PROOF_URL_MAX,
  PROOF_MAX_ROWS,
} from "./proof";

describe("normaliseProofUrl", () => {
  it("keeps a well-formed http(s) link whole", () => {
    expect(normaliseProofUrl("https://imgur.com/a/xyz")).toBe("https://imgur.com/a/xyz");
    expect(normaliseProofUrl("http://imgur.com/a/xyz")).toBe("http://imgur.com/a/xyz");
  });

  it("keeps the query and the fragment", () => {
    const u = "https://cdn.discordapp.com/attachments/1/2/x.png?ex=abc&is=def#frag";
    expect(normaliseProofUrl(u)).toBe(u);
  });

  it("assumes https for a bare host or a protocol-relative paste", () => {
    expect(normaliseProofUrl("imgur.com/a/xyz")).toBe("https://imgur.com/a/xyz");
    expect(normaliseProofUrl("//imgur.com/a/xyz")).toBe("https://imgur.com/a/xyz");
    expect(normaliseProofUrl("  imgur.com/a/xyz  ")).toBe("https://imgur.com/a/xyz");
  });

  /*
   * The whole point of the allow-list. new URL() PARSES every one of these happily,
   * so a parse-only check would let a javascript: URL reach an href.
   */
  it("rejects every scheme that isn't http(s)", () => {
    expect(normaliseProofUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseProofUrl("JavaScript:alert(1)")).toBeNull();
    expect(normaliseProofUrl("data:text/html,<script>x</script>")).toBeNull();
    expect(normaliseProofUrl("file:///c:/secrets.txt")).toBeNull();
    expect(normaliseProofUrl("vbscript:msgbox(1)")).toBeNull();
    expect(normaliseProofUrl("mailto:someone@example.com")).toBeNull();
  });

  it("rejects nothing, whitespace and a host with no dot", () => {
    expect(normaliseProofUrl("")).toBeNull();
    expect(normaliseProofUrl("   ")).toBeNull();
    expect(normaliseProofUrl("not a url")).toBeNull();
    expect(normaliseProofUrl("https://localhost:3000/x")).toBeNull();
  });

  it("rejects an over-length URL rather than truncating it", () => {
    const long = "https://imgur.com/" + "a".repeat(PROOF_URL_MAX);
    expect(long.length).toBeGreaterThan(PROOF_URL_MAX);
    expect(normaliseProofUrl(long)).toBeNull();
    // and one that just fits still passes
    const fits = "https://imgur.com/" + "a".repeat(PROOF_URL_MAX - "https://imgur.com/".length);
    expect(fits.length).toBe(PROOF_URL_MAX);
    expect(normaliseProofUrl(fits)).toBe(fits);
  });

  /*
   * The cross-check against the check constraint in 0005. Anything this function
   * returns has to satisfy the column, or a save that the popup happily enabled dies
   * in Postgres with a raw constraint message.
   */
  it("only ever returns something the SQL constraint accepts", () => {
    const candidates = [
      "https://imgur.com/a/xyz",
      "imgur.com/a/xyz",
      "//imgur.com/a/xyz",
      "http://i.redd.it/x.png?a=1#b",
      "https://user:pass@imgur.com/a/xyz",
      "https://imgur.com/a/ xyz",
      "javascript:alert(1)",
      "",
    ];
    for (const c of candidates) {
      const out = normaliseProofUrl(c);
      if (out !== null) {
        expect(out, c).toMatch(/^https?:\/\/\S+$/);
        expect(out.length).toBeLessThanOrEqual(PROOF_URL_MAX);
      }
    }
  });
});

describe("proofHost", () => {
  it("drops the scheme, the www and everything after the host", () => {
    expect(proofHost("https://www.imgur.com/a/xyz")).toBe("imgur.com");
    expect(proofHost("imgur.com/a/xyz")).toBe("imgur.com");
    expect(proofHost("https://cdn.discordapp.com/attachments/1/2/x.png")).toBe(
      "cdn.discordapp.com",
    );
  });

  it("is empty for anything unusable, so the title fallback stays harmless", () => {
    expect(proofHost("")).toBe("");
    expect(proofHost("javascript:alert(1)")).toBe("");
  });
});

describe("isProofId / blankProofRow", () => {
  it("recognises the uuid shape and nothing else", () => {
    expect(isProofId(blankProofRow().id)).toBe(true);
    expect(isProofId("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isProofId("not-a-uuid")).toBe(false);
    expect(isProofId("")).toBe(false);
    expect(isProofId(undefined)).toBe(false);
    expect(isProofId(42)).toBe(false);
  });

  it("mints a fresh id every time", () => {
    const a = blankProofRow();
    const b = blankProofRow();
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ title: "", url: "", ord: 0 });
  });
});

describe("cleanProofRows", () => {
  it("drops rows with no usable URL", () => {
    const out = cleanProofRows([
      { id: "a", title: "typed a title but no link", url: "" },
      { title: "bad scheme", url: "javascript:alert(1)" },
      { title: "keeper", url: "https://imgur.com/a/1" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://imgur.com/a/1");
  });

  it("keeps a valid id and mints one for anything else", () => {
    const keep = "11111111-1111-4111-8111-111111111111";
    const out = cleanProofRows([
      { id: keep, url: "https://imgur.com/a/1" },
      { id: "row-2", url: "https://imgur.com/a/2" },
      { url: "https://imgur.com/a/3" },
    ]);
    expect(out[0].id).toBe(keep);
    expect(isProofId(out[1].id)).toBe(true);
    expect(isProofId(out[2].id)).toBe(true);
    expect(new Set(out.map((r) => r.id)).size).toBe(3);
  });

  it("trims and caps the title", () => {
    const out = cleanProofRows([
      { title: "   spaced out   ", url: "https://imgur.com/a/1" },
      { title: "x".repeat(PROOF_TITLE_MAX + 40), url: "https://imgur.com/a/2" },
    ]);
    expect(out[0].title).toBe("spaced out");
    expect(out[1].title).toHaveLength(PROOF_TITLE_MAX);
  });

  it("de-dupes on the normalised URL, keeping the first", () => {
    const out = cleanProofRows([
      { title: "first", url: "https://imgur.com/a/1" },
      { title: "same link, different casing", url: "HTTPS://Imgur.com/a/1" },
      { title: "same link, no scheme", url: "imgur.com/a/1" },
      { title: "different", url: "https://imgur.com/a/2" },
    ]);
    expect(out.map((r) => r.title)).toEqual(["first", "different"]);
  });

  it("caps the list and renumbers ord contiguously from 0", () => {
    const many = Array.from({ length: PROOF_MAX_ROWS + 5 }, (_, i) => ({
      url: `https://imgur.com/a/${i}`,
    }));
    const out = cleanProofRows(many);
    expect(out).toHaveLength(PROOF_MAX_ROWS);
    expect(out.map((r) => r.ord)).toEqual(out.map((_, i) => i));
  });

  it("renumbers ord after a dropped row, not around the hole", () => {
    const out = cleanProofRows([
      { url: "https://imgur.com/a/1", ord: 7 },
      { url: "", ord: 8 },
      { url: "https://imgur.com/a/2", ord: 9 },
    ]);
    expect(out.map((r) => r.ord)).toEqual([0, 1]);
  });

  it("returns an empty list for an empty, all-blank or junk input", () => {
    expect(cleanProofRows([])).toEqual([]);
    expect(cleanProofRows([{ title: "", url: "" }, { title: "  ", url: "  " }])).toEqual([]);
    // the action passes whatever the client sent, so junk must not throw
    expect(cleanProofRows([null as never, undefined as never])).toEqual([]);
    expect(cleanProofRows("nope" as never)).toEqual([]);
  });
});

/*
 * The URL rule and the row limits exist in TypeScript and again in SQL, because the
 * column is the last line of defence against a hand-crafted request. Rather than
 * generate one from the other (and have the generator rot), assert they agree — the
 * same trick the 0004 suite in scoring.test.ts plays.
 */
describe("migration 0005 agrees with the code", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/0005_tile_proofs.sql", import.meta.url),
    "utf8",
  );

  it("caps title and url at the same lengths lib/proof.ts does", () => {
    const title = sql.match(/char_length\(title\)\s*<=\s*(\d+)/);
    expect(title, "no title length check in 0005").not.toBeNull();
    expect(Number(title![1])).toBe(PROOF_TITLE_MAX);

    const url = sql.match(/char_length\(url\)\s*between\s*1\s*and\s*(\d+)/);
    expect(url, "no url length check in 0005").not.toBeNull();
    expect(Number(url![1])).toBe(PROOF_URL_MAX);
  });

  it("constrains the url to the same schemes normaliseProofUrl allows", () => {
    expect(sql).toMatch(/url\s*~\*\s*'\^https\?:\/\//);
  });

  /*
   * Both halves of the realtime wiring, which is the one trap this schema can fall
   * into silently: with the policy but no publication entry, reads work and nothing
   * ever live-updates; with the TABLES entry but no publication, the same. Neither
   * shows up as an error anywhere.
   */
  it("grants the select policy and joins the realtime publication", () => {
    expect(sql).toContain("array['tile_proofs']");
    expect(sql).toContain("for select using (true)");
    expect(sql).toContain("supabase_realtime");
  });

  it("is subscribed to by components/realtime.tsx", () => {
    // Read as text, not imported: realtime.tsx is a "use client" module that pulls in
    // next/navigation, which has no business loading in a node test environment.
    const rt = readFileSync(new URL("../components/realtime.tsx", import.meta.url), "utf8");
    expect(rt).toContain('"tile_proofs"');
  });
});
