import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * OAuth `state` for the GitHub App round trip (PRD 5.5: verified against the signed-in
 * user). The cookie is HttpOnly and scoped to the callback; it names the user who started
 * the flow, so a callback in another account's session is refused.
 */
const COOKIE = "sk_gh";
const RETURN_TO = ["onboarding", "settings"] as const;
export type GithubReturnTo = (typeof RETURN_TO)[number];

export interface GithubState {
  state: string;
  userId: string;
  returnTo: GithubReturnTo;
}

const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/github",
  maxAge: 15 * 60,
};

export async function startGithubState(userId: string, returnTo: GithubReturnTo): Promise<string> {
  const state = randomBytes(16).toString("hex");
  (await cookies()).set(COOKIE, `${state}.${userId}.${returnTo}`, options);
  return state;
}

export async function readGithubState(): Promise<GithubState | null> {
  const value = (await cookies()).get(COOKIE)?.value ?? "";
  const [state, userId, returnTo] = value.split(".");
  if (!/^[0-9a-f]{32}$/.test(state ?? "") || !userId || !RETURN_TO.includes(returnTo as GithubReturnTo)) return null;
  return { state, userId, returnTo: returnTo as GithubReturnTo };
}

export async function clearGithubState() {
  (await cookies()).set(COOKIE, "", { ...options, maxAge: 0 });
}

export function githubReturnPath(returnTo: GithubReturnTo): "/onboarding/github" | "/settings/github" {
  return returnTo === "onboarding" ? "/onboarding/github" : "/settings/github";
}
