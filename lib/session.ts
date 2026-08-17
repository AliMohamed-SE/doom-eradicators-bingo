import "server-only";
import { cookies } from "next/headers";

// Identity comes from the Discord auth session (see lib/auth.ts). The only cookie
// here is the per-device leader-code unlock.
const LEADER_COOKIE = "de_leader";
const ONE_YEAR = 60 * 60 * 24 * 365;

const baseOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_YEAR,
};

export function verifyLeaderCode(code: string): boolean {
  const secret = process.env.LEADER_CODE;
  return !!secret && code === secret;
}

/** Has this device entered the correct leader code? */
export async function hasLeaderCode(): Promise<boolean> {
  const secret = process.env.LEADER_CODE;
  if (!secret) return false;
  const store = await cookies();
  return store.get(LEADER_COOKIE)?.value === secret;
}

export async function setLeaderCookie(on: boolean) {
  const store = await cookies();
  const secret = process.env.LEADER_CODE;
  if (on && secret) store.set(LEADER_COOKIE, secret, baseOpts);
  else store.delete(LEADER_COOKIE);
}
