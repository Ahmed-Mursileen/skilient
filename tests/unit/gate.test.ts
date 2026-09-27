import { describe, expect, it } from "vitest";
import { decideRoute, homeFor, onboardingPath, requiresTwoFactor, safeNext, type GateInput, type GateState } from "@/lib/auth/gate";

const done: GateState = {
  has_profile: true,
  role: "student",
  university_id: "u1",
  username: "aisha",
  onboarding_complete: true,
  onboarding_step: 6,
  agreement_version: 1,
  agreement_accepted: true,
  email_allowed: true,
};

const at = (path: string, over: Partial<GateInput> = {}): GateInput => {
  const [pathname] = path.split("?");
  return { pathname, path, signedIn: true, aal: "aal1", hasVerifiedFactor: false, state: done, ...over };
};

describe("safeNext", () => {
  it("keeps same-origin paths with their query", () => {
    expect(safeNext("/profile/aisha?tab=skills")).toBe("/profile/aisha?tab=skills");
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "feed", "/auth/callback", "/signin", "/signup/verify", "/x\u0000"])(
    "refuses %s",
    (value) => expect(safeNext(value)).toBeNull(),
  );
});

describe("homeFor", () => {
  it("sends people to the agreement, then onboarding, then the feed", () => {
    expect(homeFor({ ...done, agreement_accepted: false, onboarding_complete: false })).toBe("/agreement");
    expect(homeFor({ ...done, onboarding_complete: false, onboarding_step: 3 })).toBe("/onboarding/github");
    expect(homeFor(done)).toBe("/feed");
  });
  it("clamps odd step numbers", () => {
    expect(onboardingPath(0)).toBe("/onboarding/university");
    expect(onboardingPath(99)).toBe("/onboarding/people");
  });
});

describe("decideRoute", () => {
  it("lets anyone through public paths", () => {
    for (const p of ["/", "/auth/confirmed", "/api/health", "/ui"]) {
      expect(decideRoute(at(p, { signedIn: false, state: null }))).toEqual({ type: "next" });
    }
  });

  it("sends signed-out visitors to sign in, keeping where they were going", () => {
    expect(decideRoute(at("/settings/security", { signedIn: false, state: null }))).toEqual({
      type: "redirect",
      to: "/signin?next=%2Fsettings%2Fsecurity",
    });
    expect(decideRoute(at("/profile/aisha", { signedIn: false, state: null }))).toMatchObject({ to: "/signin?next=%2Fprofile%2Faisha" });
  });

  it("lets signed-out visitors use the auth pages", () => {
    for (const p of ["/signin", "/signup", "/signup/verify", "/forgot-password", "/reset-password"]) {
      expect(decideRoute(at(p, { signedIn: false, state: null }))).toEqual({ type: "next" });
    }
  });

  it("redirects signed-in users away from sign in and sign up (PRD 5.2)", () => {
    expect(decideRoute(at("/signin"))).toEqual({ type: "redirect", to: "/feed" });
    expect(decideRoute(at("/signup", { state: { ...done, onboarding_complete: false, onboarding_step: 2 } }))).toEqual({
      type: "redirect",
      to: "/onboarding/profile",
    });
  });

  it("holds an enrolled account at the two-factor step until the session is aal2", () => {
    expect(decideRoute(at("/feed", { hasVerifiedFactor: true }))).toEqual({ type: "redirect", to: "/signin/mfa?next=%2Ffeed" });
    expect(decideRoute(at("/signin/mfa", { hasVerifiedFactor: true }))).toEqual({ type: "next" });
    expect(decideRoute(at("/feed", { hasVerifiedFactor: true, aal: "aal2" }))).toEqual({ type: "next" });
    expect(decideRoute(at("/signin/mfa", { aal: "aal2", hasVerifiedFactor: true }))).toEqual({ type: "redirect", to: "/feed" });
  });

  it("requires two-factor for staff, recruiter and university portals", () => {
    expect(requiresTwoFactor("/ops/queues")).toBe(true);
    expect(requiresTwoFactor("/opsx")).toBe(false);
    expect(decideRoute(at("/ops"))).toEqual({ type: "redirect", to: "/settings/security?required=1" });
    expect(decideRoute(at("/uni/students", { aal: "aal2" }))).toEqual({ type: "next" });
  });

  it("blocks everything behind a new agreement version", () => {
    const state = { ...done, agreement_accepted: false };
    expect(decideRoute(at("/feed", { state }))).toEqual({ type: "redirect", to: "/agreement?next=%2Ffeed" });
    expect(decideRoute(at("/agreement", { state }))).toEqual({ type: "next" });
    expect(decideRoute(at("/agreement"))).toEqual({ type: "redirect", to: "/feed" });
  });

  it("routes incomplete onboarding to the saved step; Back works, skipping ahead doesn't", () => {
    const state = { ...done, onboarding_complete: false, onboarding_step: 3 };
    expect(decideRoute(at("/feed", { state }))).toEqual({ type: "redirect", to: "/onboarding/github" });
    expect(decideRoute(at("/onboarding/profile", { state }))).toEqual({ type: "next" });
    expect(decideRoute(at("/onboarding/github", { state }))).toEqual({ type: "next" });
    expect(decideRoute(at("/onboarding/people", { state }))).toEqual({ type: "redirect", to: "/onboarding/github" });
    expect(decideRoute(at("/onboarding", { state }))).toEqual({ type: "redirect", to: "/onboarding/github" });
  });

  it("sends onboarded users from the wizard to the feed, except the done screen", () => {
    expect(decideRoute(at("/onboarding/university"))).toEqual({ type: "redirect", to: "/feed" });
    expect(decideRoute(at("/onboarding/done"))).toEqual({ type: "next" });
  });

  it("signs out an account whose email domain is no longer allowed", () => {
    expect(decideRoute(at("/feed", { state: { ...done, email_allowed: false } }))).toEqual({
      type: "sign-out",
      to: "/signin?error=domain",
    });
  });

  it("lets a recovery session reach /reset-password whatever else is pending", () => {
    expect(decideRoute(at("/reset-password", { state: { ...done, agreement_accepted: false } }))).toEqual({ type: "next" });
  });
});
