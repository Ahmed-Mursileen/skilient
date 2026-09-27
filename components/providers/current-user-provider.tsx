"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth/current-user-types";
import { clearClientState, hardNavigate, onAuthMessage } from "@/lib/auth/channel";
import { createClient } from "@/lib/supabase/client";

const CurrentUserContext = createContext<CurrentUser | null>(null);

/**
 * Identity for client components (PRD 5.2). Seeded by the server from getUser(); remounted
 * (by key) when the user changes. Any sign-out, here or in another tab, clears client state
 * and hard-navigates to "/" so nothing of the previous user survives.
 */
export function CurrentUserProvider({ initialUser, children }: { initialUser: CurrentUser | null; children: ReactNode }) {
  useEffect(() => {
    const leave = () => {
      clearClientState();
      hardNavigate("/");
    };
    const stopChannel = onAuthMessage((message) => {
      if (message === "signed-out") leave();
    });
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" && initialUser) leave();
      // A different account signed in from another tab: reload so the server re-seeds.
      if (event === "SIGNED_IN" && session && session.user.id !== initialUser?.id) window.location.reload();
    });
    return () => {
      stopChannel();
      subscription.unsubscribe();
    };
  }, [initialUser]);

  return <CurrentUserContext.Provider value={initialUser}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext);
}
