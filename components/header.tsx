"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./app-provider";
import { useConfirm } from "./confirm";
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
  const { me, isLeader, canBeLeader, state, rival, pending, run } = useApp();
  const confirm = useConfirm();
  const pathname = usePathname();
  const score = scoreOf(state.done);

  /*
   * RIVAL is the one conditional tab in here, and the condition is two-sided: a
   * leader always sees it (that tab is where tracking is switched on), and everyone
   * else only once a board exists. Hiding it from the team until then is the point
   * — an empty RIVAL tab would advertise a feature nobody had decided to use yet.
   */
  const tabs = [
    ...TABS,
    ...(rival || isLeader ? [{ href: "/rival", label: "RIVAL" }] : []),
    ...(isLeader
      ? [
          { href: "/roster", label: "ROSTER" },
          { href: "/contrib", label: "CONTRIB" },
          { href: "/report", label: "REPORT" },
        ]
      : []),
  ];

  function unlock() {
    const code = window.prompt("Leader code:");
    if (code == null) return;
    run(async () => {
      const res = await unlockLeader(code);
      if (res?.error) window.alert(res.error);
    });
  }

  async function lock() {
    const ok = await confirm({
      title: "LOCK LEADER?",
      message: "Lock leader controls on this device? You'll need the code again to unlock.",
      confirmLabel: "LOCK",
      tone: "danger",
    });
    if (ok) run(() => lockLeader());
  }

  return (
    /* no-print: the nav is app chrome, not part of the exported report. */
    <div className="no-print sticky top-0 z-40 border-b-2 border-border-default header-gradient">
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

      {/*
        The one global "the server is working" signal.

        run() has always wrapped every mutation in a transition and exposed
        `pending`, and until now nothing rendered it — so the gap between tapping
        something and the refresh landing (a round trip to Supabase and back, a few
        hundred ms on a good connection) looked identical to the app ignoring you.
        Optimistic patches hide that for the tiles; everything without one — a
        leader forcing a region, starting or stopping rival tracking, signing out —
        had no feedback at all.

        It lives in the sticky header so it is on screen wherever you are, and it
        is a fixed-height strip rather than a conditional block so nothing on the
        page shifts when it appears.
      */}
      <div className="h-[3px] w-full overflow-hidden bg-transparent" aria-hidden={!pending}>
        {pending && <div className="working-bar h-full w-full" />}
      </div>
      <span className="sr-only" role="status">
        {pending ? "Saving" : ""}
      </span>
    </div>
  );
}
