"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./app-provider";
import { signOut, unlockLeader, lockLeader } from "@/app/actions";
import { scoreOf } from "@/lib/scoring";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/board", label: "BOARD" },
  { href: "/planning", label: "PLANNING" },
  { href: "/my-tiles", label: "MY TILES" },
  { href: "/setup", label: "MY SETUP" },
  { href: "/rules", label: "RULES" },
];

export function Header() {
  const { me, isLeader, canBeLeader, state, run } = useApp();
  const pathname = usePathname();
  const score = scoreOf(state.done);

  const tabs = isLeader ? [...TABS, { href: "/roster", label: "ROSTER" }] : TABS;

  function unlock() {
    const code = window.prompt("Leader code:");
    if (code == null) return;
    run(async () => {
      const res = await unlockLeader(code);
      if (res?.error) window.alert(res.error);
    });
  }

  function lock() {
    if (window.confirm("Lock leader controls on this device?")) run(() => lockLeader());
  }

  return (
    <div className="sticky top-0 z-40 border-b-2 border-border-default header-gradient">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-[10px] p-[10px_12px]">
        <div className="min-w-[150px] flex-1">
          <div className="font-mono text-[15px] tracking-[.5px] text-orange [text-shadow:2px_2px_0_#000]">
            DOOM ERADICATORS
          </div>
          <div className="text-[13px] text-ink-dim">{me?.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="border-2 border-border-default bg-surface-inset px-[10px] py-[5px] text-center">
            <div className="font-mono text-[11px] text-ink-dim">POINTS</div>
            <div className="font-mono text-[17px] text-yellow [text-shadow:1px_1px_0_#000]">
              {score.total}
            </div>
          </div>
          {isLeader ? (
            <button
              type="button"
              onClick={lock}
              title="Lock leader controls on this device"
              className="flex min-h-[42px] cursor-pointer items-center border-2 border-amber-border bg-amber-bg p-[10px] font-mono text-[11px] text-amber-text"
            >
              LEADER
            </button>
          ) : (
            canBeLeader && (
              <button
                type="button"
                onClick={unlock}
                className="flex min-h-[42px] cursor-pointer items-center border-2 border-amber-border bg-surface-dark p-[10px] font-mono text-[11px] text-amber-text"
              >
                UNLOCK LEADER
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => run(() => signOut())}
            className="min-h-[42px] cursor-pointer border-2 border-border-default bg-surface-dark p-[10px] font-mono text-[11px] text-ink-dim"
          >
            LOG OUT
          </button>
        </div>
      </div>
      <div className="scroll-x mx-auto flex max-w-[1280px] gap-[6px] overflow-x-auto p-[0_8px_8px]">
        {tabs.map((tb) => {
          const active = pathname === tb.href;
          return (
            <Link
              key={tb.href}
              href={tb.href}
              className={cn(
                "min-h-[42px] flex-none border-2 p-[10px_12px] font-mono text-[11px]",
                active
                  ? "border-orange bg-amber-btn text-amber-soft"
                  : "border-border-default bg-surface-dark text-ink-dim",
              )}
            >
              {tb.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
