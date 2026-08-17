"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/cn";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}
type Request = ConfirmOptions & { resolve: (v: boolean) => void };

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

/** Themed, centered confirm dialog. `const confirm = useConfirm(); await confirm({...})`. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<Request | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setReq({ ...o, resolve })),
    [],
  );

  const close = (v: boolean) => {
    setReq((cur) => {
      cur?.resolve(v);
      return null;
    });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(8,6,4,.72)] p-5">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => close(false)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative w-full max-w-[420px] border-2 border-amber-border panel-gradient p-[16px] shadow-[0_0_0_2px_#17130d,0_14px_40px_rgba(0,0,0,.6)]">
            {req.title && (
              <div className="mb-2 font-mono text-[13px] text-orange [text-shadow:1px_1px_0_#000]">
                {req.title}
              </div>
            )}
            <div className="mb-4 text-[15px] leading-[1.4] text-ink [text-wrap:pretty]">
              {req.message}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="min-h-[46px] flex-1 cursor-pointer border-2 border-border-default bg-surface-dark p-[11px] font-mono text-[12px] text-ink-dim"
              >
                {req.cancelLabel ?? "CANCEL"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className={cn(
                  "min-h-[46px] flex-1 cursor-pointer border-2 p-[11px] font-mono text-[12px]",
                  req.tone === "danger"
                    ? "border-red-border bg-red-bg text-red-text"
                    : "border-green-border2 bg-green-bg2 text-green-text2",
                )}
              >
                {req.confirmLabel ?? "CONFIRM"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
