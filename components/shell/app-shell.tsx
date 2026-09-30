"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { BottomTabs } from "@/components/shell/bottom-tabs";
import { NavBadgesSync } from "@/components/shell/nav-badges";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { TourHost, type TourInitial } from "@/components/tour/tour-host";

/**
 * The five-area student shell (PRD 5.25, screen spec 2): sidebar on desktop, an icon rail on
 * tablets, a top bar and bottom tabs on phones. Onboarding, the agreement and a pending
 * deletion keep the plain header, and so do the other portals until they get their own
 * shells (phases 7-9).
 */
export function AppShell({ children, tour }: { children: ReactNode; tour: TourInitial }) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const focused = (pathname.startsWith("/onboarding") && pathname !== "/onboarding/done") || pathname === "/agreement";
  if (!user || focused || user.status === "deleting" || user.role !== "student" || !user.onboardingComplete) {
    return (
      <>
        <AppHeader />
        {children}
      </>
    );
  }
  return (
    <>
      <NavBadgesSync userId={user.id} />
      <Sidebar />
      <div className="md:pl-[72px] lg:pl-60">
        <TopBar />
        <div className="pb-20 md:pb-0">{children}</div>
      </div>
      <BottomTabs />
      <Suspense fallback={null}>
        <TourHost tourId="student" initial={tour} />
      </Suspense>
    </>
  );
}
