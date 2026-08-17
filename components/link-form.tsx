"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { RARES, type RareId } from "@/lib/board-data";
import { linkCharacter, signOut } from "@/app/actions";
import { cn } from "@/lib/cn";

export function LinkForm({ available }: { available: string[] }) {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [rares, setRares] = useState<RareId[]>([]);
  const [task, setTask] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggleRare(id: RareId) {
    setRares((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  }

  function submit() {
    if (!name) {
      setError("Pick who you are on the team.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await linkCharacter({ name, rares, task });
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.push("/board");
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-[560px] border-2 border-border-default panel-gradient p-[18px] shadow-[0_0_0_2px_#17130d,0_14px_40px_rgba(0,0,0,.6)]">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-mono text-[15px] text-orange [text-shadow:2px_2px_0_#000]">
            LINK YOUR CHARACTER
          </div>
          <button
            type="button"
            onClick={() => startTransition(() => signOut())}
            className="cursor-pointer font-mono text-[11px] text-ink-dim"
          >
            SIGN OUT
          </button>
        </div>
        <div className="mb-4 mt-2 text-[15px] text-ink-dim">
          Your Discord is signed in. Claim your spot on the team — this locks it to you.
        </div>

        {/* Who are you */}
        <div className="mb-3 border-2 border-border-default bg-surface-inset p-3">
          <div className="mb-[10px] font-mono text-[12px] text-amber-body">1 · WHO ARE YOU</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(145px,1fr))] gap-2">
            {available.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setName(p)}
                className={cn(
                  "min-h-[46px] cursor-pointer border-2 p-[12px_8px] text-center text-[15px]",
                  name === p
                    ? "border-orange bg-amber-btn text-amber-soft"
                    : "roster-btn-gradient border-border-default text-amber-soft hover:border-orange",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Mega-rares */}
        <div className="mb-3 border-2 border-border-default bg-surface-inset p-3">
          <div className="mb-[10px] font-mono text-[12px] text-amber-body">2 · MEGA-RARES YOU OWN</div>
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
                    <span className="text-[12px] text-ink-dim">{on ? "Got it" : "Tap if you own it"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Task */}
        <div className="border-2 border-border-default bg-surface-inset p-3">
          <div className="mb-[10px] font-mono text-[12px] text-amber-body">3 · MY SLAYER TASK</div>
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Basilisk Knights, or Alchemical Hydra"
            className="min-h-[48px] w-full border-2 border-border-default bg-parchment p-3 text-[15px] text-parchment-ink outline-none placeholder:text-[#7a6f57]"
          />
        </div>

        {error && <div className="mt-2 text-[13px] text-red-text">{error}</div>}

        <button
          type="button"
          onClick={submit}
          disabled={pending || !name}
          className="mt-[14px] min-h-[54px] w-full cursor-pointer border-2 border-green-border2 bg-green-bg2 p-[15px] font-mono text-[13px] text-green-text2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "LINKING…" : !name ? "PICK WHO YOU ARE FIRST" : "LINK & PLAY"}
        </button>
      </div>
    </div>
  );
}
