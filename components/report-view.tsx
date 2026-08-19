"use client";

import { useMemo } from "react";
import { useApp } from "./app-provider";
import { buildReport, fmtDate, type ReportTarget } from "@/lib/report";
import { proofHost, normaliseProofUrl } from "@/lib/proof";
import { cn } from "@/lib/cn";

/**
 * The leader's export report, printed to PDF through the browser's own "Save as PDF".
 *
 * Everything a printed page needs is in the markup and in the @media print block at the
 * end of app/globals.css: chrome opts out with .no-print, sections break onto fresh
 * pages, and the dark skin is re-skinned to ink-on-white — browsers drop background
 * colours by default, so state can never be conveyed by a fill here. That is why NO
 * PROOF is a word rather than a coloured chip, and why there are no sprites.
 *
 * A completion and its proof sit in the same block on purpose: the question this report
 * answers is "is this one backed up?", and an appendix elsewhere would make that a
 * cross-referencing exercise instead of a glance.
 */
export function ReportView({ generatedAt }: { generatedAt: string }) {
  const { state, players, completionMeta } = useApp();
  const model = useMemo(
    () => buildReport({ state, players, completionMeta }),
    [state, players, completionMeta],
  );
  const { totals, score } = model;

  return (
    <div className="print-doc mx-auto max-w-[900px]">
      {/* Screen-only controls */}
      <div className="no-print mb-3 flex flex-wrap items-center gap-3 border-2 border-border-default panel-gradient p-3">
        <div className="flex-1 font-mono text-[13px] text-orange">EXPORT REPORT</div>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-[46px] cursor-pointer border-2 border-amber-border bg-amber-bg p-[12px_16px] font-mono text-[12px] text-amber-text"
        >
          EXPORT PDF
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Summary + how the points add up                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="print-section print-block border-2 border-border-default panel-gradient p-3">
        <h1 className="print-heading font-mono text-[17px] text-orange [text-shadow:1px_1px_0_#000]">
          DOOM ERADICATORS — BINGO REPORT
        </h1>
        <div className="mt-[6px] text-[13px] text-ink-dim">
          Generated {fmtDate(generatedAt)} (UTC) from live event data.
        </div>

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-[6px]">
          <Stat label="TOTAL POINTS" value={score.total} />
          <Stat label="TILES DONE" value={`${totals.tilesDone} / ${totals.tilesTotal}`} />
          <Stat
            label="REGIONS OPEN"
            value={`${totals.regionsUnlocked} / ${totals.regionsTotal}`}
          />
          <Stat label="BLACKOUTS" value={totals.regionsBlackedOut} />
          <Stat
            label="BRIDGES CLEARED"
            value={`${totals.bridgesDone} / ${totals.bridgesTotal}`}
          />
          <Stat label="PROOF LINKS" value={totals.proofCount} />
          <Stat label="DONE, NO PROOF" value={totals.missingProof} alert />
        </div>

        <h2 className="print-heading mt-4 font-mono text-[12px] text-amber-text">
          POINTS BY REGION
        </h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <Th align="left">REGION</Th>
                <Th>TILES</Th>
                <Th>ROWS</Th>
                <Th>COLS</Th>
                <Th>MIDDLE</Th>
                <Th>BLACKOUT</Th>
                <Th>POINTS</Th>
              </tr>
            </thead>
            <tbody>
              {model.regions.map((r) => (
                <tr key={r.id}>
                  <Td align="left">
                    {r.name}
                    {!r.unlocked && <span className="text-ink-faint"> · locked</span>}
                  </Td>
                  <Td>{r.stats.count} / 9</Td>
                  <Td>{r.stats.rows}</Td>
                  <Td>{r.stats.cols}</Td>
                  <Td>{r.stats.mid ? "yes" : "—"}</Td>
                  <Td>{r.stats.blackout ? "yes" : "—"}</Td>
                  <Td>
                    <span className="font-mono text-yellow">{r.stats.points}</span>
                  </Td>
                </tr>
              ))}
              <tr>
                <Td align="left">
                  <span className="font-mono text-[12px] text-amber-text">TOTAL</span>
                </Td>
                <Td>
                  {totals.tilesDone} / {totals.tilesTotal}
                </Td>
                <Td>{score.rows / 5}</Td>
                <Td>{score.cols / 5}</Td>
                <Td>{score.mids / 3}</Td>
                <Td>{totals.regionsBlackedOut}</Td>
                <Td>
                  <span className="font-mono text-[15px] text-yellow">{score.total}</span>
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Completed tiles with their proof, region by region                */}
      {/* ------------------------------------------------------------------ */}
      <section className="print-section mt-3">
        <h2 className="print-heading font-mono text-[13px] text-orange">
          COMPLETED TILES &amp; PROOF
        </h2>
        <div className="mt-2 grid gap-3">
          {model.regions.map((r) => (
            <div
              key={r.id}
              className="print-block border-2 border-border-default region-gradient p-3"
            >
              <div className="print-heading flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[16px] text-amber-soft">{r.name}</span>
                <span className="font-mono text-[11px] text-ink-dim">
                  {r.stats.count} / 9 done · {r.stats.points} pts ·{" "}
                  {r.unlocked ? "open" : "locked"}
                </span>
              </div>

              {r.done.length === 0 ? (
                <div className="mt-2 text-[14px] text-ink-dim">
                  Nothing completed here yet.
                </div>
              ) : (
                <div className="mt-2 grid gap-2">
                  {r.done.map((t) => (
                    <TargetBlock key={t.id} t={t} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Bridges, same shape                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="print-section mt-3">
        <h2 className="print-heading font-mono text-[13px] text-orange">
          BRIDGES CLEARED &amp; PROOF
        </h2>
        <div className="print-block mt-2 border-2 border-border-default region-gradient p-3">
          <div className="text-[13px] leading-[1.35] text-ink-dim [text-wrap:pretty]">
            {totals.bridgesDone} of {totals.bridgesTotal} cleared. Bridges score no
            points — they open the region on the far side.
          </div>
          {model.bridges.length === 0 ? (
            <div className="mt-2 text-[14px] text-ink-dim">No bridges cleared yet.</div>
          ) : (
            <div className="mt-2 grid gap-2">
              {model.bridges.map((t) => (
                <TargetBlock key={t.id} t={t} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  alert,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-2 p-[8px_10px]",
        alert && value !== 0
          ? "border-amber-border bg-amber-bg"
          : "border-border-default bg-surface-inset",
      )}
    >
      <div className="font-mono text-[10px] text-ink-dim">{label}</div>
      <div className="mt-[3px] font-mono text-[17px] text-yellow">{value}</div>
    </div>
  );
}

function Th({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <th
      className={cn(
        "border-b-2 border-border-default p-[6px_8px] font-mono text-[10px] font-normal whitespace-nowrap text-ink-dim",
        align === "left" ? "text-left" : "text-center",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <td
      className={cn(
        "border-b border-border-dim p-[6px_8px] align-top text-ink-dim2",
        align === "left" ? "text-left" : "text-center",
      )}
    >
      {children}
    </td>
  );
}

/**
 * One completed target: what it was, when it was recorded, and the links behind it.
 * Shared by the region lists and the bridge list, which differ only in whether the
 * position is a grid cell or the pair of regions the bridge joins.
 */
function TargetBlock({ t }: { t: ReportTarget }) {
  return (
    <div className="print-block border border-border-dim bg-surface-inset p-[8px_10px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-[2px]">
        <span className="text-[15px] leading-[1.2] text-ink">{t.name}</span>
        <span className="font-mono text-[11px] whitespace-nowrap text-ink-dim">
          {t.isBridge ? t.regionName : `R${t.row}C${t.col}`} · {fmtDate(t.completedAt)}
          {t.recordedByName && ` · recorded by ${t.recordedByName}`}
        </span>
      </div>

      {t.isFreeSpace ? (
        <div className="mt-[5px] font-mono text-[11px] text-ink-faint">
          FREE SPACE · NO PROOF NEEDED
        </div>
      ) : t.proofs.length === 0 ? (
        /* A word, not a coloured chip: browsers drop background colours when printing. */
        <div className="mt-[5px] font-mono text-[11px] text-amber-text">NO PROOF</div>
      ) : (
        <ol className="mt-[6px] grid list-none gap-[6px] p-0">
          {t.proofs.map((p, i) => {
            const href = normaliseProofUrl(p.url);
            return (
              <li key={p.id} className="border-l-2 border-border-default pl-[8px]">
                <div className="text-[14px] leading-[1.25] text-ink-dim2">
                  {i + 1}. {p.title || proofHost(p.url) || "Untitled"}
                </div>
                {/* The URL as real text, not an a::after print trick — so it is readable
                    and copyable on screen as well as on paper. */}
                <div className="print-url mt-[2px] font-mono text-[11px] leading-[1.3] text-ink-dim">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {href}
                    </a>
                  ) : (
                    <span className="text-ink-faint">{p.url} — not a usable link</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
