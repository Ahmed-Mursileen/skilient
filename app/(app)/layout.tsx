import type { Metadata } from "next";
import { AppHeader } from "@/components/app/app-header";
import { CurrentUserProvider } from "@/components/providers/current-user-provider";
import { getCurrentUser } from "@/lib/auth/current-user";

// PRD 10: signed-in pages are never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Signed-in area. proxy.ts has already gated the request; this seeds identity from the
 * server (getUser()) for useCurrentUser(). Keyed by user id so another account never
 * inherits client state. The five-area shell arrives in phase 6.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <CurrentUserProvider key={user?.id ?? "signed-out"} initialUser={user}>
      <AppHeader />
      {children}
    </CurrentUserProvider>
  );
}
