"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { SELECTABLE_NAMES, RARES, type RareId } from "@/lib/board-data";
import { chooseCharacter, createProfile } from "@/app/actions";
import { cn } from "@/lib/cn";

export function OnboardingClient({ claimedNames }: { claimedNames: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState<"identity" | "gear">("identity");
  const [name, setName] = useState<string | null>(null);
  const [rares, setRares] = useState<RareId[]>([]);
  const [task, setTask] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const claimed = new Set(claimedNames);

  function pick(n: string) {
    setError("");
    startTransition(async () => {
      const res = await chooseCharacter(n);
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (res.exists) {
        router.push("/board");
      } else {
        setName(n);
        setStep("gear");
      }
    });
  }

  function toggleRare(id: RareId) {
    setRares((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  }

  function finish() {
    if (!name) return;
    setError("");
    startTransition(async () => {
      const res = await createProfile({ name, rares, task });
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.push("/board");
    });
  }

  if (step === "identity") {
    return (
      <Shell>
        <div className="px-0 pt-[6px] pb-[14px] text-center">
          <div className="font-mono text-[20px] tracking-[1px] text-orange [text-shadow:2px_2px_0_#000]">
            DOOM ERADICATORS
          </div>
          <div className="mt-[6px] text-[15px] text-ink-dim2">Celeris August Bingo</div>
        </div>
        <div className="border-2 border-border-default bg-parchment p-[14px] text-parchment-ink">
          <div className="mb-3 text-center font-mono text-[14px]">WHO ARE YA?</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(145px,1fr))] gap-2">
            {SELECTABLE_NAMES.map((p) => (
              <button
                key={p}
                type="button"
                disabled={pending}
                onClick={() => pick(p)}
                className="roster-btn-gradient min-h-[46px] cursor-pointer border-2 border-border-default p-[12px_8px] text-center text-[15px] text-amber-soft hover:border-orange hover:text-white disabled:opacity-60"
              >
                {p}
                {claimed.has(p) && <span className="block text-[11px] text-ink-dim">in play</span>}
              </button>
            ))}
          </div>
          {error && <div className="mt-3 text-center text-[13px] text-[#8a2f1e]">{error}</div>}
          <div className="mt-3 text-center text-[13px] text-parchment-foot">
            Tap your name to play. Pick the same name on any device to pick up where you left off.
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="font-mono text-[15px] text-orange [text-shadow:2px_2px_0_#000]">
        GEAR CHECK · {name}
      </div>
      <div className="mb-4 mt-2 text-[15px] text-ink-dim">
        Two things the leader needs before you touch the board.
      </div>

      <div className="mb-3 border-2 border-border-default bg-surface-inset p-3">
        <div className="mb-[10px] font-mono text-[12px] text-amber-body">1 · MEGA-RARES YOU OWN</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          {RARES.map((r) => {
            const on = rares.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRare(r.id)}
                className={cn(
                  "flex min-h-[62px] cursor-pointer items-center gap-[10px] border-2 p-[10px] text-left",
                  on
                    ? "border-green-border2 bg-green-bg2 text-green-text2"
                    : "border-border-default bg-tile-available-bg text-ink",
                )}
              >
                <Image
                  src={r.img}
                  alt={r.name}
                  width={34}
                  height={34}
                  className="pixelated h-[34px] w-[34px] flex-none object-contain"
                />
                <span className="text-[14px] leading-[1.2]">
                  {r.name}
                  <br />
                  <span className="text-[12px] text-ink-dim">
                    {on ? "Got it" : "Tap if you own it"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-[9px] text-[13px] text-ink-dim">None, one, or all three. Whatever&apos;s true.</div>
      </div>

      <div className="border-2 border-border-default bg-surface-inset p-3">
        <div className="mb-[10px] font-mono text-[12px] text-amber-body">2 · MY SLAYER TASK</div>
        <input
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="e.g. Slayer task: Basilisk Knights, or grinding TOA"
          className="min-h-[48px] w-full border-2 border-border-default bg-parchment p-3 text-[15px] text-parchment-ink outline-none placeholder:text-[#7a6f57]"
        />
      </div>

      {error && <div className="mt-2 text-[13px] text-red-text">{error}</div>}

      <button
        type="button"
        onClick={finish}
        disabled={pending}
        className="mt-[14px] min-h-[54px] w-full cursor-pointer border-2 border-green-border2 bg-green-bg2 p-[15px] font-mono text-[13px] text-green-text2 disabled:opacity-60"
      >
        {pending ? "SAVING…" : "TO THE BOARD"}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep("identity");
          setError("");
        }}
        className="mt-2 w-full cursor-pointer text-center text-[13px] text-ink-dim"
      >
        ← pick a different name
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-[560px] border-2 border-border-default panel-gradient p-[18px] shadow-[0_0_0_2px_#17130d,0_14px_40px_rgba(0,0,0,.6)]">
        {children}
      </div>
    </div>
  );
}
