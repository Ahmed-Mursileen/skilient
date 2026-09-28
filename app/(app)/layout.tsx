import type { Metadata } from "next";
import { after } from "next/server";
import { AppHeader } from "@/components/app/app-header";
import { CurrentUserProvider } from "@/components/providers/current-user-provider";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

// PRD 10: signed-in pages are never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Signed-in area. proxy.ts has already gated the request; this seeds identity from the
 * server (getUser()) for useCurrentUser(). Keyed by user id so another account never
 * inherits client state. The five-area shell arrives in phase 6.
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
  return (
    <CurrentUserProvider key={user?.id ?? "signed-out"} initialUser={user}>
      <AppHeader />
      {children}
    </CurrentUserProvider>
  );
}
