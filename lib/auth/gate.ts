/**
 * Route gates (PRD 5.2, 5.27, 10): who may see which path, and where everyone else goes.
 * Pure so proxy.ts, /auth/callback and the tests share one decision table.
 */

/** Shape of public.my_gate_state(). */
export interface GateState {
  has_profile: boolean;
  role: string | null;
  university_id: string | null;
  username: string | null;
  onboarding_complete: boolean;
  onboarding_step: number;
  agreement_version: number | null;
  agreement_accepted: boolean;
  email_allowed: boolean;
  /** Absent on a database from before phase 6. */
  status?: "active" | "graduate" | "deleting";
}

export const ONBOARDING_STEPS = ["university", "profile", "github", "skills", "looking-for", "people"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function onboardingPath(step: number): string {
  const index = Math.min(Math.max(Math.trunc(step) || 1, 1), ONBOARDING_STEPS.length) - 1;
  return `/onboarding/${ONBOARDING_STEPS[index]}`;
}

/** 1-based step number for an onboarding slug, or null. */
export function onboardingStepNumber(slug: string): number | null {
  const i = (ONBOARDING_STEPS as readonly string[]).indexOf(slug);
  return i === -1 ? null : i + 1;
}

/** Where a signed-in user belongs right now (PRD 5.2: onboarding if incomplete, else /feed). */
export const DELETE_PATH = "/settings/account/delete";

export function homeFor(state: GateState): string {
  if (state.status === "deleting") return DELETE_PATH;
  if (!state.agreement_accepted) return "/agreement";
  if (!state.onboarding_complete) return onboardingPath(state.onboarding_step);
  // Faculty have no student onboarding: their home is the teacher portal (PRD 5.21); recruiters'
  // is the recruiter portal (PRD 5.20), where /recruit sends them on to /org/join until they
  // belong to an organisation.
  if (state.role === "recruiter") return "/recruit";
  return state.role === "faculty" ? "/teach" : "/feed";
}

const AUTH_PAGES = ["/signin", "/signup", "/forgot-password"];

/**
 * A validated same-origin path for `next` (PRD 5.2: /auth/callback honours it).
 * Refuses absolute and protocol-relative URLs, backslashes, control characters and
 * auth pages (which would loop).
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, "https://skilient.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://skilient.invalid") return null;
  if (url.pathname.startsWith("/auth/") || AUTH_PAGES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Open to everyone, signed in or not. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    ["/auth", "/api", "/ui", "/verify", "/cv", "/.well-known"].some((p) => matches(pathname, p))
  );
}

/** Signed-in users are sent home from these (PRD 5.2). */
export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => matches(pathname, p)) && pathname !== "/signin/mfa";
}

/** Portals whose roles must use two-factor (PRD 10): refused on an aal1 session. */
export function requiresTwoFactor(pathname: string): boolean {
  return ["/ops", "/uni", "/recruit", "/org"].some((p) => matches(pathname, p));
}

/** The only areas a recruiter account uses (PRD 5.20): everything else is for students. */
const RECRUITER_PREFIXES = ["/recruit", "/org", "/companies", "/chat", "/notifications", "/settings", "/feedback"];

/** Who may open the recruiter portal: recruiter accounts only. */
function isRecruiterArea(pathname: string): boolean {
  return matches(pathname, "/recruit") || matches(pathname, "/org");
}

export interface GateInput {
  pathname: string;
  /** pathname + search, for ?next= */
  path: string;
  signedIn: boolean;
  aal: string | null;
  hasVerifiedFactor: boolean;
  state: GateState | null;
}

export type GateDecision = { type: "next" } | { type: "redirect"; to: string } | { type: "sign-out"; to: string };

const next = { type: "next" } as const;
const redirect = (to: string): GateDecision => ({ type: "redirect", to });
const withNext = (base: string, path: string) => {
  const n = safeNext(path);
  return n && n !== "/" ? `${base}?next=${encodeURIComponent(n)}` : base;
};

export function decideRoute({ pathname, path, signedIn, aal, hasVerifiedFactor, state }: GateInput): GateDecision {
  if (isPublicPath(pathname)) return next;

  if (!signedIn) {
    if (isAuthPage(pathname) || pathname === "/reset-password") return next;
    return redirect(withNext("/signin", path));
  }

  // Two-factor enrolled but this session hasn't passed it yet.
  const mfaPending = hasVerifiedFactor && aal !== "aal2";
  if (pathname === "/signin/mfa") return mfaPending ? next : redirect(state ? homeFor(state) : "/feed");
  if (mfaPending) return redirect(withNext("/signin/mfa", path));

  if (!state || !state.has_profile || !state.email_allowed) {
    return { type: "sign-out", to: "/signin?error=domain" };
  }

  // Cooling-off (PRD 5.25): a deleting account can only reach the page that cancels it.
  if (state.status === "deleting") return pathname === DELETE_PATH ? next : redirect(DELETE_PATH);

  if (isAuthPage(pathname)) return redirect(homeFor(state));
  if (pathname === "/reset-password") return next;
  if (requiresTwoFactor(pathname) && aal !== "aal2") return redirect("/settings/security?required=1");

  if (!state.agreement_accepted) {
    return pathname === "/agreement" ? next : redirect(withNext("/agreement", path));
  }
  if (pathname === "/agreement") return redirect(homeFor(state));

  if (!state.onboarding_complete) {
    if (matches(pathname, "/onboarding")) {
      const slug = pathname.split("/")[2];
      const step = slug ? onboardingStepNumber(slug) : null;
      // Back always works; skipping ahead of the saved step does not.
      if (step !== null && step <= state.onboarding_step) return next;
      return redirect(onboardingPath(state.onboarding_step));
    }
    return redirect(onboardingPath(state.onboarding_step));
  }
  if (matches(pathname, "/onboarding") && pathname !== "/onboarding/done") return redirect(homeFor(state));

  // Recruiter accounts stay in their own area; nobody else opens it.
  if (state.role === "recruiter" && !RECRUITER_PREFIXES.some((p) => matches(pathname, p))) return redirect("/recruit");
  if (isRecruiterArea(pathname) && state.role !== "recruiter") return redirect(homeFor(state));

  return next;
}
