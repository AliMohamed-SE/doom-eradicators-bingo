"use client";

import { useTransition } from "react";
import { signOut } from "@/app/actions";

export function NoSeats() {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-[540px] border-2 border-red-border panel-gradient p-[18px] shadow-[0_0_0_2px_#17130d,0_14px_40px_rgba(0,0,0,.6)]">
        <div className="px-0 pt-[6px] pb-[14px] text-center">
          <div className="font-mono text-[20px] tracking-[1px] text-orange [text-shadow:2px_2px_0_#000]">
            DOOM ERADICATORS
          </div>
          <div className="mt-[6px] text-[15px] text-ink-dim2">Celeris August Bingo</div>
        </div>
        <div className="border-2 border-red-border bg-red-bg p-[16px] text-center">
          <div className="font-mono text-[15px] text-red-text">TEAM FULL · NO SEATS LEFT</div>
          <p className="mt-3 text-[15px] leading-[1.45] text-[#f0cbbf]">
            Every Doom Eradicator has already been claimed, so there&apos;s no character to link this
            Discord to. If you think this is a mistake, ask the leader.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => signOut())}
          disabled={pending}
          className="mt-4 min-h-[50px] w-full cursor-pointer border-2 border-border-default bg-surface-dark p-[13px] font-mono text-[12px] text-ink-dim disabled:opacity-60"
        >
          {pending ? "SIGNING OUT…" : "SIGN OUT"}
        </button>
      </div>
    </div>
  );
}
