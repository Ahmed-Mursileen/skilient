import type { Metadata } from "next";
import { after } from "next/server";
import { CurrentUserProvider } from "@/components/providers/current-user-provider";
import { AppShell } from "@/components/shell/app-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTourState } from "@/lib/data/portal";
import { createClient } from "@/lib/supabase/server";

// PRD 10: signed-in pages are never indexed.
const NO_TOUR = { started: false, step: 0, completed: false, skipped: false };

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Signed-in area. proxy.ts has already gated the request; this seeds identity from the
 * server (getUser()) for useCurrentUser(). Keyed by user id so another account never
 * inherits client state. AppShell is the five-area student shell (phase 6).
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
  const tour = user && user.role === "student" && user.onboardingComplete ? await getTourState("student") : NO_TOUR;
  return (
    <CurrentUserProvider key={user?.id ?? "signed-out"} initialUser={user}>
      <AppShell tour={tour}>{children}</AppShell>
    </CurrentUserProvider>
  );
}
