import type { Metadata } from "next";
import { after } from "next/server";
import { AnalyticsIdentity } from "@/components/analytics/analytics-identity";
import { CurrentUserProvider } from "@/components/providers/current-user-provider";
import { UpgradeSheetHost } from "@/components/billing/upgrade-sheet";
import { AppShell } from "@/components/shell/app-shell";
import { RestrictionBanner } from "@/components/shell/restriction-banner";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTourState } from "@/lib/data/portal";
import { getMyRestriction } from "@/lib/data/sanctions";
import { createClient } from "@/lib/supabase/server";

// PRD 10: signed-in pages are never indexed.
const NO_TOUR = { started: false, step: 0, completed: false, skipped: false };

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Signed-in area. proxy.ts has already gated the request; this seeds identity from the
 * server (getUser()) for useCurrentUser(). Keyed by user id so another account never
 * inherits client state. AppShell is the five-area student shell (phase 6). A suspended account
 * sees a banner on every page (phase 11).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (user) {
    // Last-active time (at most one write an hour) decides who gets the daily digest.
    const supabase = await createClient();
    after(async () => {
      await supabase.rpc("touch_activity");
    });
  }
  const [tour, restriction] = await Promise.all([
    user && user.role === "student" && user.onboardingComplete ? getTourState("student") : NO_TOUR,
    user ? getMyRestriction() : null,
  ]);
  return (
    <CurrentUserProvider key={user?.id ?? "signed-out"} initialUser={user}>
      <AppShell tour={tour}>
        {restriction ? <RestrictionBanner restriction={restriction} /> : null}
        {children}
      </AppShell>
      <UpgradeSheetHost />
      <AnalyticsIdentity />
    </CurrentUserProvider>
  );
}
