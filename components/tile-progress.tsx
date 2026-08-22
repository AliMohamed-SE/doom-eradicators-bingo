"use client";

import { useEffect, useState } from "react";
import { useApp, patchProgress, patchItem, patchNote } from "./app-provider";
import { useConfirm } from "./confirm";
import {
  progressSpec,
  progressTotal,
  itemOwners,
  tickCredit,
  fmtNum,
  type Target,
} from "@/lib/scoring";
import type { NoteField } from "@/lib/board-data";
import { logProgress, toggleItem, setTileNote } from "@/app/actions";
import { SetGrid } from "./tile-set-grid";
import { cn } from "@/lib/cn";

/**
 * The PROGRESS panel of the tile drawer. One component, three shapes — the modes
 * share the panel chrome, the permission gate and the confirm plumbing, so
 * splitting them into three files would mean three copies of all of it.
 *
 * `canProgress` is computed once in tile-sheet.tsx, where reviewers look for it.
 */
export function TileProgress({
  target,
  canProgress,
  isDone,
  name,
}: {
  target: Target;
  canProgress: boolean;
  isDone: boolean;
  name: string;
}) {
  const { state, me, run } = useApp();
  const confirm = useConfirm();

  const id = target.id;
  const uid = me?.id ?? "";
  const spec = progressSpec(target);
  const total = progressTotal(state.progress, id);
  const mine = state.progress[id]?.[uid] ?? 0;

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-[4px]">
      <div>
        <div className="font-mono text-[11px] text-ink-dim">PROGRESS</div>
        <div className="mt-[5px] font-mono text-[18px] text-yellow">
          {fmtNum(total)} <span className="text-ink-dim">/ {fmtNum(spec.goal)}</span>
        </div>
        {spec.mode === "bulk" && (
          <div className="mt-[3px] text-[13px] text-ink-dim2">
            {spec.unit ? spec.unit + " · " : ""}
            {fmtNum(Math.max(0, spec.goal - total))} to go
          </div>
        )}
      </div>
      {spec.mode === "bulk" && (
        <div className="text-right">
          <div className="font-mono text-[11px] text-ink-dim">YOURS</div>
          <div className="mt-[5px] font-mono text-[15px] text-green-soft">{fmtNum(mine)}</div>
        </div>
      )}
    </div>
  );

  const panel = "grid gap-[8px] border-2 border-border-default bg-surface-inset p-[10px]";

  if (spec.mode === "checklist") {
    return (
      <div className={panel}>
        {/* A finished set tile has said everything in one line ("FULL SET — Dharok
            the Wretched"), so the 4/4 above it would only repeat itself. */}
        {!(spec.sets.length && isDone) && head}
        {spec.note && <TileNote id={id} field={spec.note} canProgress={canProgress} />}
        {spec.sets.length > 0 ? (
          <SetGrid target={target} canProgress={canProgress} isDone={isDone} name={name} />
        ) : (
          <ChecklistBoxes
            target={target}
            canProgress={canProgress}
            isDone={isDone}
            name={name}
            confirm={confirm}
          />
        )}
      </div>
    );
  }

  if (spec.mode === "bulk") {
    return (
      <div className={panel}>
        {head}
        {canProgress && (
          <BulkEntry
            id={id}
            uid={uid}
            name={name}
            goal={spec.goal}
            unit={spec.unit}
            quick={spec.quick}
            total={total}
            mine={mine}
            confirm={confirm}
            run={run}
          />
        )}
      </div>
    );
  }

  // count — unchanged behaviour, just relocated
  return (
    <div className="flex flex-wrap items-center gap-[10px] border-2 border-border-default bg-surface-inset p-[10px]">
      <div className="flex-1 basis-[120px]">
        <div className="font-mono text-[11px] text-ink-dim">PROGRESS</div>
        <div className="mt-[5px] font-mono text-[18px] text-yellow">
          {total} / {spec.goal}
        </div>
      </div>
      {canProgress && (
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-dim2">Your count: {mine}</span>
          <button
            type="button"
            onClick={() =>
              run(() => logProgress(id, -1), uid ? patchProgress(uid, id, -1, spec.goal) : undefined)
            }
            className="min-h-[48px] w-[48px] cursor-pointer border-2 border-border-default bg-surface-btn text-[20px] text-ink"
          >
            −
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!isDone && total + 1 >= spec.goal) {
                const ok = await confirm({
                  title: "COMPLETE TILE?",
                  message: `This logs the last of the goal and marks "${name}" done. Are you sure?`,
                  confirmLabel: "COMPLETE IT",
                });
                if (!ok) return;
              }
              run(() => logProgress(id, 1), uid ? patchProgress(uid, id, 1, spec.goal) : undefined);
            }}
            className="min-h-[48px] w-[48px] cursor-pointer border-2 border-amber-border bg-amber-btn text-[20px] text-amber-soft"
          >
            +
          </button>
        </div>
      )}
      {spec.alt.length > 0 && (
        <AltBoxes
          target={target}
          canProgress={canProgress}
          isDone={isDone}
          name={name}
          confirm={confirm}
        />
      )}
    </div>
  );
}

type Confirm = ReturnType<typeof useConfirm>;

// ---------------------------------------------------------------------------
// Shared note
// ---------------------------------------------------------------------------

/**
 * One line of text everyone on the tile shares. Only a couple of objectives need
 * it, and they are the ones whose boxes are ambiguous on their own: a Barrows set
 * has to be four pieces of the SAME brother, so which brother is a team decision
 * that belongs next to the boxes rather than in someone's head.
 */
function TileNote({
  id,
  field,
  canProgress,
}: {
  id: string;
  field: NoteField;
  canProgress: boolean;
}) {
  const { state, run } = useApp();
  const saved = state.notes[id] ?? "";
  const [draft, setDraft] = useState(saved);
  // Adopt the server's value whenever it changes under us (someone else typed).
  useEffect(() => setDraft(saved), [saved]);

  const commit = () => {
    const text = draft.trim();
    if (text === saved) return;
    run(() => setTileNote(id, text), patchNote(id, text));
  };

  if (!canProgress) {
    return (
      <div>
        <div className="font-mono text-[11px] text-ink-dim">{field.label}</div>
        <div className="mt-[5px] text-[15px] text-ink-dim2">{saved || "Not decided yet"}</div>
      </div>
    );
  }

  return (
    <label className="grid gap-[5px]">
      <span className="font-mono text-[11px] text-ink-dim">{field.label}</span>
      <input
        type="text"
        value={draft}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="done"
        placeholder={field.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="min-h-[52px] w-full border-2 border-border-default bg-surface-inset2 p-[10px] text-[15px] text-ink placeholder:text-ink-faint"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

function ChecklistBoxes({
  target,
  canProgress,
  isDone,
  name,
  confirm,
}: {
  target: Target;
  canProgress: boolean;
  isDone: boolean;
  name: string;
  confirm: Confirm;
}) {
  const { state } = useApp();
  const spec = progressSpec(target);
  const owners = itemOwners(state.items, target.id);
  const filled = tickCredit(target, owners);

  return (
    <>
      <div className="grid gap-[6px]">
        {spec.items.map((item) => (
          <ItemBox
            key={item.k}
            target={target}
            itemKey={item.k}
            label={item.n}
            weight={1}
            owner={owners[item.k] ?? null}
            canProgress={canProgress}
            goalMet={filled >= spec.goal}
            isDone={isDone}
            name={name}
            confirm={confirm}
          />
        ))}
      </div>
      {spec.alt.length > 0 && (
        <AltBoxes
          target={target}
          canProgress={canProgress}
          isDone={isDone}
          name={name}
          confirm={confirm}
        />
      )}
      {!canProgress && !isDone && (
        <div className="text-[13px] leading-[1.35] text-ink-dim">
          Hit &ldquo;I&rsquo;m on this&rdquo; below to tick items.
        </div>
      )}
    </>
  );
}

/** The "…or just one of these" escape hatch — a Shadow instead of three Masori. */
function AltBoxes({
  target,
  canProgress,
  isDone,
  name,
  confirm,
}: {
  target: Target;
  canProgress: boolean;
  isDone: boolean;
  name: string;
  confirm: Confirm;
}) {
  const { state } = useApp();
  const spec = progressSpec(target);
  const owners = itemOwners(state.items, target.id);
  return (
    <div className="grid w-full gap-[6px] border-t border-border-dim pt-[8px]">
      <div className="font-mono text-[11px] text-ink-dim">…OR JUST ONE OF THESE</div>
      {spec.alt.map((item) => (
        <ItemBox
          key={item.k}
          target={target}
          itemKey={item.k}
          label={item.n}
          weight={spec.goal}
          owner={owners[item.k] ?? null}
          canProgress={canProgress}
          goalMet={false}
          isDone={isDone}
          name={name}
          confirm={confirm}
        />
      ))}
    </div>
  );
}

function ItemBox({
  target,
  itemKey,
  label,
  weight,
  owner,
  canProgress,
  goalMet,
  isDone,
  name,
  confirm,
}: {
  target: Target;
  itemKey: string;
  label: string;
  weight: number;
  owner: string | null;
  canProgress: boolean;
  goalMet: boolean;
  isDone: boolean;
  name: string;
  confirm: Confirm;
}) {
  const { me, isLeader, playerName, state, run } = useApp();
  const uid = me?.id ?? "";
  const spec = progressSpec(target);
  const ticked = !!owner;
  const isMine = owner === uid && !!uid;
  const ownerName = owner ? playerName(owner) : "";

  // Ticking is free; unticking belongs to whoever ticked it, or a leader. A
  // finished tile is read-only for everyone — canProgress already excludes it,
  // which keeps "Undo done" as the single way to un-complete something.
  const enabled = canProgress && !!uid && (ticked ? isMine || isLeader : !goalMet);

  const owners = itemOwners(state.items, target.id);
  const filled = tickCredit(target, owners);

  const onClick = async () => {
    if (!enabled) return;
    if (!ticked) {
      if (!isDone && filled + weight >= spec.goal) {
        const ok = await confirm({
          title: "COMPLETE TILE?",
          message: `${label} is the last of ${spec.goal} and marks "${name}" done. Are you sure?`,
          confirmLabel: "COMPLETE IT",
        });
        if (!ok) return;
      }
      run(
        () => toggleItem(target.id, itemKey, true),
        uid ? patchItem(uid, target.id, itemKey, true, weight, spec.goal) : undefined,
      );
      return;
    }
    if (!isMine) {
      const ok = await confirm({
        title: "REMOVE TICK?",
        message: `This removes ${ownerName}'s ${label} and takes ${weight} off their count.`,
        confirmLabel: "REMOVE IT",
        tone: "danger",
      });
      if (!ok) return;
    }
    run(
      () => toggleItem(target.id, itemKey, false),
      owner ? patchItem(owner, target.id, itemKey, false, weight, spec.goal) : undefined,
    );
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ticked}
      aria-label={
        label +
        (weight > 1 ? `, clears the whole tile` : "") +
        (owner ? `, ticked by ${isMine ? "you" : ownerName}` : ", not yet")
      }
      disabled={!enabled}
      onClick={onClick}
      className={cn(
        "flex min-h-[52px] items-center gap-[9px] border-2 p-[9px_10px] text-left",
        enabled && "cursor-pointer",
        isMine
          ? "mine-gradient border-green-border2 text-green-text2"
          : ticked
            ? "border-green-border bg-green-bg3 text-green-soft2"
            : enabled
              ? "border-border-default bg-surface-btn text-ink"
              : "border-border-dim bg-surface-inset text-ink-faint",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-[24px] w-[24px] shrink-0 items-center justify-center border-2 font-mono text-[14px] leading-none",
          ticked
            ? "border-green-border bg-green-bg text-green-soft"
            : "border-border-default bg-surface-inset text-ink-faint",
        )}
      >
        {ticked ? "✓" : ""}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-[1.2]">{label}</span>
        <span className="mt-[2px] block truncate text-[13px]">
          {owner ? (isMine ? "you" : ownerName) : "not yet"}
        </span>
      </span>
      {weight > 1 && (
        <span className="shrink-0 border border-amber-border bg-amber-bg px-[6px] py-[3px] font-mono text-[10px] text-amber-text">
          CLEARS IT
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------

function BulkEntry({
  id,
  uid,
  name,
  goal,
  unit,
  quick,
  total,
  mine,
  confirm,
  run,
}: {
  id: string;
  uid: string;
  name: string;
  goal: number;
  unit: string;
  quick: readonly number[];
  total: number;
  mine: number;
  confirm: Confirm;
  run: ReturnType<typeof useApp>["run"];
}) {
  const [raw, setRaw] = useState("");
  const amount = parseInt(raw, 10) || 0;
  // Overshoot clamps what gets logged, never what you may type: people enter the
  // number they actually did and shouldn't be corrected mid-keystroke.
  const applied = Math.min(amount, Math.max(0, goal - total));
  const clamped = amount > 0 && applied < amount;

  const add = async (n: number) => {
    const give = Math.min(n, Math.max(0, goal - total));
    if (give <= 0) return;
    if (total + give >= goal) {
      const ok = await confirm({
        title: "COMPLETE TILE?",
        message: `This logs the last ${fmtNum(give)} of ${fmtNum(goal)} and marks "${name}" done. Are you sure?`,
        confirmLabel: "COMPLETE IT",
      });
      if (!ok) return;
    }
    setRaw("");
    run(() => logProgress(id, give), uid ? patchProgress(uid, id, give, goal) : undefined);
  };

  const subtract = async () => {
    const take = Math.min(amount, goal);
    if (take <= 0) return;
    if (take > 1) {
      const ok = await confirm({
        title: `REMOVE ${fmtNum(take)}?`,
        message: `Takes ${fmtNum(take)} off your own count (${fmtNum(mine)} logged).`,
        confirmLabel: "REMOVE IT",
        tone: "danger",
      });
      if (!ok) return;
    }
    setRaw("");
    run(() => logProgress(id, -take), uid ? patchProgress(uid, id, -take, goal) : undefined);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void add(amount);
      }}
      className="grid gap-[8px]"
    >
      <div className="flex items-stretch gap-2">
        {/* Not type="number": it brings desktop spinners into a square-everything
            skin, accepts e/-/. and reports "" for anything invalid. Stripping
            non-digits on change makes negatives and decimals untypeable instead,
            so there is no error state to design. */}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          autoComplete="off"
          aria-label={`How many ${unit || "to log"}`}
          value={raw}
          onChange={(e) => setRaw(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
          placeholder={String(quick[0] ?? 1)}
          className="min-h-[52px] min-w-0 flex-1 border-2 border-border-default bg-surface-inset2 p-[10px] text-center font-mono text-[18px] text-ink placeholder:text-ink-faint"
        />
        <button
          type="button"
          disabled={!amount}
          onClick={() => void subtract()}
          className="min-h-[52px] w-[60px] shrink-0 cursor-pointer border-2 border-border-default bg-surface-btn font-mono text-[15px] text-ink disabled:cursor-default disabled:opacity-50"
        >
          −
        </button>
        <button
          type="submit"
          disabled={!amount}
          className="min-h-[52px] w-[60px] shrink-0 cursor-pointer border-2 border-amber-border bg-amber-btn font-mono text-[15px] text-amber-soft disabled:cursor-default disabled:opacity-50"
        >
          +
        </button>
      </div>

      <div className="flex gap-2">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void add(q)}
            className="min-h-[48px] flex-1 cursor-pointer border-2 border-border-default bg-surface-dark font-mono text-[13px] text-ink-dim2"
          >
            +{fmtNum(q)}
          </button>
        ))}
      </div>

      <div className="text-[13px] leading-[1.35] text-ink-dim">
        {amount
          ? `+ logs ${fmtNum(applied)} of your own${clamped ? " (the last of the goal)" : ""}. − takes it back off your count.`
          : `Type how many ${unit || "you did"}, then hit +.`}
      </div>
    </form>
  );
}
