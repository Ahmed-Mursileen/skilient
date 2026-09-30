"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { NO_BADGES, type NavBadges } from "@/lib/nav";
import { createClient } from "@/lib/supabase/client";

/**
 * The counts on every nav item (PRD 5.25). They live in a tiny external store, not in a
 * React context provider: a provider that wraps the page and re-renders when a count arrives
 * made React re-hydrate the still-streaming page content and leave a hidden second copy of it
 * in the DOM. `NavBadgesSync` (renders nothing, sits beside the page, not around it) fills the
 * store; the nav items read it with `useNavBadges()`.
 */
let current: NavBadges = NO_BADGES;
const listeners = new Set<() => void>();

function publish(next: NavBadges) {
  current = next;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function useNavBadges(): NavBadges {
  return useSyncExternalStore(subscribe, () => current, () => NO_BADGES);
}

/** One nav_badges() call, refreshed on each navigation, on focus, and live over Realtime. */
export function NavBadgesSync({ userId }: { userId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refresh = () =>
      supabase.rpc("nav_badges").then(({ data }) => {
        if (alive && data && typeof data === "object") publish({ ...NO_BADGES, ...(data as Partial<NavBadges>) });
      });
    void refresh();
    // Realtime applies RLS with the socket's token: load the signed-in JWT before joining.
    void supabase.realtime.setAuth().then(() => {
      if (!alive) return;
      channel = supabase
        .channel(`nav-badges:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
          void refresh();
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
          if ((payload.new as { sender_id?: string }).sender_id !== userId) setTimeout(() => void refresh(), 1500);
        })
        .subscribe();
    });
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, pathname]);

  // Another account signing in must not inherit the previous counts.
  useEffect(() => () => publish(NO_BADGES), [userId]);
  return null;
}
