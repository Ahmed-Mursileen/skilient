import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { LiveAt } from "@/components/marketing/live-at";
import type { InitialEmailState } from "@/components/marketing/uni-email-field";
import { hero } from "@/content/marketing";
import { getLandingStats, getViewer } from "@/lib/data/marketing";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = {
  title: { absolute: "Skilient: prove your skills with real work" },
  description: hero.subline,
};

/**
 * The landing page (PRD 5.1, screen spec 3.1, docs/marketing-design-plan.md B6). `?email` and
 * `?state` come back from /join when the field was sent without JavaScript.
 */
export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const [viewer, stats, sp] = await Promise.all([getViewer(), getLandingStats(), searchParams]);
  const email = typeof sp.email === "string" ? sp.email.trim().slice(0, 254) : "";
  const state: InitialEmailState = sp.state === "personal" || sp.state === "invalid" ? sp.state : null;
  return (
    <>
      <Hero home={viewer?.home ?? null} siteKey={turnstileSiteKey()} defaultEmail={email} initialState={state} />
      <LiveAt stats={stats} />
    </>
  );
}
