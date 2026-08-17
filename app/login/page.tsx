"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setPending(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
    // otherwise the browser is redirected to Discord
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-[540px] border-2 border-border-default panel-gradient p-[18px] shadow-[0_0_0_2px_#17130d,0_14px_40px_rgba(0,0,0,.6)]">
        <div className="px-0 pt-[6px] pb-[14px] text-center">
          <div className="font-mono text-[20px] tracking-[1px] text-orange [text-shadow:2px_2px_0_#000]">
            DOOM ERADICATORS
          </div>
          <div className="mt-[6px] text-[15px] text-ink-dim2">Celeris August Bingo</div>
        </div>

        <div className="border-2 border-border-default bg-parchment p-[16px] text-parchment-ink">
          <div className="mb-3 text-center font-mono text-[14px]">CLAN MEMBERS ONLY</div>
          <p className="mb-4 text-center text-[14px] leading-[1.4]">
            Sign in with the Discord account you use in the clan, then link it to your character.
          </p>
          <button
            type="button"
            onClick={signIn}
            disabled={pending}
            className="min-h-[54px] w-full cursor-pointer border-2 border-[#4752c4] bg-[#5865F2] p-[15px] font-mono text-[13px] text-white disabled:opacity-60"
          >
            {pending ? "REDIRECTING…" : "CONTINUE WITH DISCORD"}
          </button>
          {error && <p className="mt-3 text-center text-[13px] text-[#8a2f1e]">{error}</p>}
        </div>
        <div className="mt-3 text-center text-[13px] text-ink-dim">
          One Discord per player. Seats are limited to the team roster.
        </div>
      </div>
    </div>
  );
}
