"use client";

import { cn } from "@/lib/cn";

export function SheetShell({
  kindLabel,
  name,
  onClose,
  action,
  maxWidth = "640px",
  children,
}: {
  kindLabel: string;
  name: string;
  onClose: () => void;
  /**
   * Optional button rendered immediately left of the ×, for an action that belongs to
   * the whole target rather than to a panel inside it. Keep it 44px wide: the header is
   * a flex row and anything wider wraps a long tile name to a third line on a phone.
   */
  action?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    /* no-print, so hitting Ctrl+P with a drawer open doesn't put it in the PDF. */
    <div className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(8,6,4,.72)]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        className="relative max-h-[92vh] w-full overflow-y-auto border-2 border-border-default sheet-gradient shadow-[0_-8px_40px_rgba(0,0,0,.7)]"
        style={{ maxWidth }}
      >
        <div className="sticky top-0 flex items-start gap-[10px] border-b-2 border-border-default bg-surface-dark p-3">
          <div className="flex-1">
            <div className="font-mono text-[11px] text-ink-dim">{kindLabel}</div>
            <div className="mt-1 font-mono text-[15px] text-orange [text-shadow:1px_1px_0_#000]">
              {name}
            </div>
          </div>
          {action}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "h-[44px] w-[44px] cursor-pointer border-2 border-border-default bg-surface-btn text-[18px] text-ink",
            )}
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-3 p-3">{children}</div>
      </div>
    </div>
  );
}
