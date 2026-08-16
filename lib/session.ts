import "server-only";
import { cookies } from "next/headers";

const PLAYER_COOKIE = "de_player";
const LEADER_COOKIE = "de_leader";
const ONE_YEAR = 60 * 60 * 24 * 365;

const baseOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_YEAR,
};

/** The chosen character's players.id, from the private cookie. */
export async function getPlayerId(): Promise<string | null> {
  const store = await cookies();
  return store.get(PLAYER_COOKIE)?.value ?? null;
}

export async function setPlayerId(id: string) {
  const store = await cookies();
  store.set(PLAYER_COOKIE, id, baseOpts);
}

export async function clearPlayer() {
  const store = await cookies();
  store.delete(PLAYER_COOKIE);
}

// ---------------------------------------------------------------------------
// Leader code — a small static gate. A designated leader enters it once per
// device (nav bar) to activate their controls.
// ---------------------------------------------------------------------------
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
