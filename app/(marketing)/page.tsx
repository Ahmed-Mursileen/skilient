import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { LiveAt } from "@/components/marketing/live-at";
import { CvPreview } from "@/components/marketing/sections/cv-preview";
import { Faq } from "@/components/marketing/sections/faq";
import { FeedBlock } from "@/components/marketing/sections/feed-block";
import { FinalCta } from "@/components/marketing/sections/final-cta";
import { ForOrgs } from "@/components/marketing/sections/for-orgs";
import { HowItWorks } from "@/components/marketing/sections/how-it-works";
import { OpportunitiesBlock } from "@/components/marketing/sections/opportunities-block";
import { OurRules } from "@/components/marketing/sections/our-rules";
import { PricingTeaser } from "@/components/marketing/sections/pricing-teaser";
import { TierLadder } from "@/components/marketing/sections/tier-ladder";
import { TrustGap } from "@/components/marketing/sections/trust-gap";
import { VenturesBlock } from "@/components/marketing/sections/ventures-block";
import type { InitialEmailState } from "@/components/marketing/uni-email-field";
import { hero } from "@/content/marketing";
import { getLandingStats, getPublicPlans, getViewer } from "@/lib/data/marketing";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = {
  title: { absolute: "Skilient: prove your skills with real work" },
  description: hero.subline,
};

/**
 * The landing page (PRD 5.1, screen spec 3.1, docs/marketing-design-plan.md B6): fifteen sections,
 * each its own layout family. `?email` and `?state` come back from /join when the field was sent
 * without JavaScript.
 */
export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const [viewer, stats, plans, sp] = await Promise.all([getViewer(), getLandingStats(), getPublicPlans(), searchParams]);
  const email = typeof sp.email === "string" ? sp.email.trim().slice(0, 254) : "";
  const state: InitialEmailState = sp.state === "personal" || sp.state === "invalid" ? sp.state : null;
  const home = viewer?.home ?? null;
  const siteKey = turnstileSiteKey();
  return (
    <>
      <Hero home={home} siteKey={siteKey} defaultEmail={email} initialState={state} />
      <LiveAt stats={stats} />
      <TrustGap />
      <HowItWorks />
      <FeedBlock />
      <VenturesBlock />
      <TierLadder />
      <CvPreview />
      <OpportunitiesBlock />
      <OurRules />
      <ForOrgs />
      <PricingTeaser plans={plans} />
      <Faq />
      <FinalCta home={home} siteKey={siteKey} />
    </>
  );
}
