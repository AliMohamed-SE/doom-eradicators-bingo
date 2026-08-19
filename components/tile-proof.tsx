"use client";

import { useState, useTransition } from "react";
import { useApp, patchProofs } from "./app-provider";
import { useConfirm } from "./confirm";
import { setTileProofs } from "@/app/actions";
import { proofsFor } from "@/lib/scoring";
import {
  blankProofRow,
  cleanProofRows,
  normaliseProofUrl,
  proofHost,
  PROOF_MAX_ROWS,
  PROOF_TITLE_MAX,
  PROOF_URL_MAX,
  type ProofLink,
} from "@/lib/proof";
import { cn } from "@/lib/cn";

/**
 * The header button, next to the drawer's ×. Leaders only — a non-leader has nothing to
 * do here, and the read-only panel in the drawer body already shows every link.
 *
 * 44px square to match the ×, and no wider: the sheet header is a flex row, so a
 * "PROOF · 3" pill would wrap a long tile name to a third line on a 360px phone. The
 * count is the second line instead, which tells a leader whether proof is already
 * attached without scrolling.
 */
export function ProofButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Proof links"
      aria-label={count ? `Proof links (${count})` : "Attach proof links"}
      className="flex h-[44px] w-[44px] shrink-0 cursor-pointer flex-col items-center justify-center border-2 border-amber-border bg-amber-btn leading-none text-amber-soft"
    >
      <span aria-hidden className="font-mono text-[9px] text-amber-text">
        PROOF
      </span>
      <span aria-hidden className="mt-[3px] font-mono text-[13px]">
        {count || "+"}
      </span>
    </button>
  );
}

/**
 * The read-only list, in the drawer body, for everyone. Renders nothing when there is
 * no proof: 93 targets each carrying an empty "nothing attached yet" panel is pure
 * noise, and a leader's header button already reads PROOF +.
 */
export function ProofPanel({ id }: { id: string }) {
  const { state } = useApp();
  const rows = proofsFor(state.proofs, id);
  if (!rows.length) return null;

  return (
    <div className="grid gap-[6px] border-2 border-border-default bg-surface-inset p-[10px]">
      <div className="font-mono text-[11px] text-ink-dim">PROOF · {rows.length}</div>
      {rows.map((r) => {
        // Re-run the rule at render rather than trusting the stored string. Cheap
        // defence in depth: a row that predates a change to normaliseProofUrl can only
        // ever come out as inert text, never as a live href.
        const href = normaliseProofUrl(r.url);
        const host = proofHost(r.url);
        return href ? (
          <a
            key={r.id}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[48px] items-center gap-[8px] border-2 border-border-default bg-surface-btn p-[9px_10px]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-[1.2] text-link">
                {r.title || host}
              </span>
              <span className="mt-[2px] block truncate font-mono text-[12px] text-ink-faint">
                {host}
              </span>
            </span>
            <span aria-hidden className="shrink-0 text-[15px] text-ink-dim">
              ↗
            </span>
          </a>
        ) : (
          <span key={r.id} className="text-[13px] leading-[1.35] text-ink-faint">
            {r.title || r.url} — not a usable link
          </span>
        );
      })}
    </div>
  );
}

/**
 * The editor popup. Mounted only while open, and it owns the draft — nothing is written
 * until SAVE.
 *
 * z-[70] sits between the sheet (z-[60], whose children this renders as) and the
 * confirm dialog (z-[80], mounted by ConfirmProvider above the whole sheet layer), so
 * this paints over the drawer and the "remove proof?" confirm still paints over this.
 */
export function ProofEditor({
  id,
  name,
  rows,
  onClose,
}: {
  id: string;
  name: string;
  rows: readonly ProofLink[];
  onClose: () => void;
}) {
  const { run } = useApp();
  const confirm = useConfirm();
  // Never open on an empty list — the first thing to do here is always type a link.
  const [draft, setDraft] = useState<ProofLink[]>(() =>
    rows.length ? rows.map((r) => ({ ...r })) : [blankProofRow()],
  );
  const [err, setErr] = useState("");
  const [saving, startSaving] = useTransition();

  const clean = cleanProofRows(draft);
  // A row is only "bad" once something has been typed into it; a blank row is just a
  // blank row, and cleanProofRows drops it.
  const bad = draft.some((r) => r.url.trim() && !normaliseProofUrl(r.url));

  const set = (rowId: string, patch: Partial<ProofLink>) =>
    setDraft((d) => d.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  const add = () => setDraft((d) => [...d, blankProofRow()]);

  const remove = async (rowId: string) => {
    // Only ask about links that are already saved. Dropping a row you just typed is not
    // a decision worth a dialog.
    if (rows.some((r) => r.id === rowId)) {
      const ok = await confirm({
        title: "REMOVE PROOF?",
        message: `Drop this link from "${name}"? It's gone once you save.`,
        confirmLabel: "REMOVE",
        tone: "danger",
      });
      if (!ok) return;
    }
    setDraft((d) => {
      const next = d.filter((r) => r.id !== rowId);
      return next.length ? next : [blankProofRow()];
    });
  };

  const save = () => {
    if (bad || saving) return;
    setErr("");
    startSaving(async () => {
      const res = await setTileProofs(id, clean);
      const failed = res && "error" in res ? res.error : "";
      if (failed) {
        // Stay open. This is the only place in the app where a failed save would throw
        // away something the user typed, so it reports inline instead of closing.
        setErr(failed);
        return;
      }
      // The action has already revalidated server-side; this patches the snapshot so the
      // panel behind the popup shows the new links immediately, then refreshes to adopt
      // the real rows. The ids match, so the list does not churn when they land.
      run(async () => {}, patchProofs(id, clean));
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(8,6,4,.72)] p-5">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Proof links"
        className="relative flex max-h-[86vh] w-full max-w-[520px] flex-col border-2 border-amber-border panel-gradient p-[16px] shadow-[0_0_0_2px_#17130d,0_14px_40px_rgba(0,0,0,.6)]"
      >
        <div className="font-mono text-[13px] text-orange [text-shadow:1px_1px_0_#000]">
          PROOF LINKS
        </div>
        <div className="mt-1 mb-3 text-[13px] leading-[1.35] text-ink-dim [text-wrap:pretty]">
          Paste the Discord or Imgur link for each screenshot. Nothing is uploaded — the
          app only stores the link and what it shows.
        </div>

        {/* The only scrolling region, so the footer stays reachable above a phone keyboard */}
        <div className="grid min-h-0 flex-1 content-start gap-[8px] overflow-y-auto">
          {draft.map((r, i) => {
            const rowBad = !!r.url.trim() && !normaliseProofUrl(r.url);
            return (
              <div
                key={r.id}
                className={cn(
                  "flex items-start gap-[6px] border-2 bg-surface-inset p-[9px]",
                  rowBad ? "border-red-border" : "border-border-default",
                )}
              >
                <div className="grid min-w-0 flex-1 gap-[6px]">
                  <input
                    value={r.title}
                    onChange={(e) => set(r.id, { title: e.target.value })}
                    maxLength={PROOF_TITLE_MAX}
                    autoComplete="off"
                    enterKeyHint="next"
                    aria-label={`Proof ${i + 1} description`}
                    placeholder="What it shows (e.g. Purple from ToA)"
                    className="min-h-[48px] w-full border-2 border-border-default bg-surface-inset2 p-[10px] text-[15px] text-ink placeholder:text-ink-faint"
                  />
                  <input
                    value={r.url}
                    onChange={(e) => set(r.id, { url: e.target.value })}
                    maxLength={PROOF_URL_MAX}
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    aria-label={`Proof ${i + 1} link`}
                    placeholder="https://…"
                    className="min-h-[48px] w-full border-2 border-border-default bg-surface-inset2 p-[10px] font-mono text-[13px] text-ink placeholder:text-ink-faint"
                  />
                  {rowBad && (
                    <div className="text-[13px] leading-[1.35] text-red-text2">
                      That isn&apos;t an http(s) link.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label={`Remove link ${i + 1}`}
                  className="min-h-[44px] w-[44px] shrink-0 cursor-pointer border-2 border-red-border bg-red-bg text-[16px] text-red-text"
                >
                  ×
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={add}
            disabled={draft.length >= PROOF_MAX_ROWS}
            className="min-h-[48px] w-full cursor-pointer border-2 border-border-default bg-surface-dark font-mono text-[12px] text-ink-dim2 disabled:cursor-default disabled:opacity-50"
          >
            {draft.length >= PROOF_MAX_ROWS ? `${PROOF_MAX_ROWS} LINKS MAX` : "+ ADD LINK"}
          </button>
        </div>

        {err && (
          <div className="mt-3 border-2 border-red-border bg-red-bg p-[9px] text-[13px] leading-[1.35] text-red-text">
            {err}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] flex-1 cursor-pointer border-2 border-border-default bg-surface-dark p-[11px] font-mono text-[12px] text-ink-dim"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={save}
            disabled={bad || saving}
            className="min-h-[46px] flex-1 cursor-pointer border-2 border-green-border2 bg-green-bg2 p-[11px] font-mono text-[12px] text-green-text2 disabled:cursor-default disabled:opacity-50"
          >
            {saving ? "SAVING…" : "SAVE"}
          </button>
        </div>
      </div>
    </div>
  );
}
