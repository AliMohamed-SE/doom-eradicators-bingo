"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useApp } from "./app-provider";
import { RARES, type RareId } from "@/lib/board-data";
import { saveProfile } from "@/app/actions";
import { cn } from "@/lib/cn";

export function SetupView() {
  const { me, isLeader } = useApp();
  const [rares, setRares] = useState<RareId[]>(me?.rares ?? []);
  const [task, setTask] = useState(me?.task ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggleRare(id: RareId) {
    setRares((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
    setSaved(false);
  }

  function save() {
    startTransition(async () => {
      await saveProfile({ rares, task });
      setSaved(true);
    });
  }

  return (
    <div className="flex max-w-[620px] flex-col gap-3">
      <div className="border-2 border-border-default panel-gradient p-3">
      <div className="mb-1 font-mono text-[13px] text-orange">MY SETUP · {me?.name}</div>
      <div className="mb-3 text-[14px] text-ink-dim">Keep this honest, the leader plans around it.</div>

      <div className="mb-2 font-mono text-[12px] text-amber-body">MEGA-RARES</div>
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

      <div className="mb-2 mt-[14px] font-mono text-[12px] text-amber-body">MY SLAYER TASK</div>
      <input
        type="text"
        value={task}
        onChange={(e) => {
          setTask(e.target.value);
          setSaved(false);
        }}
        placeholder="What are you grinding right now?"
        className="min-h-[48px] w-full border-2 border-border-default bg-parchment p-3 text-[15px] text-parchment-ink outline-none placeholder:text-[#7a6f57]"
      />

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-3 min-h-[50px] w-full cursor-pointer border-2 border-green-border2 bg-green-bg2 p-[14px] font-mono text-[13px] text-green-text2 disabled:opacity-60"
      >
        {pending ? "SAVING…" : saved ? "SAVED ✓" : "SAVE SETUP"}
      </button>
      </div>

      {isLeader && (
        <div className="border-2 border-amber-border bg-amber-bg p-3">
          <div className="mb-1 font-mono text-[12px] text-amber-text">LEADER</div>
          <div className="text-[14px] text-amber-body">
            You&apos;re a leader — you have the extra controls (force-complete, team focus, remove
            crew) and the ROSTER tab.
          </div>
        </div>
      )}
    </div>
  );
}
