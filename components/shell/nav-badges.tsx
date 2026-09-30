"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NO_BADGES, type NavBadges } from "@/lib/nav";
import { createClient } from "@/lib/supabase/client";

const BadgesContext = createContext<NavBadges>(NO_BADGES);

export function useNavBadges(): NavBadges {
  return useContext(BadgesContext);
}

/**
 * The counts on every nav item, from one nav_badges() call (PRD 5.25). It refreshes on each
 * navigation and when the tab regains focus, and live over Realtime when a notification or
 * a chat message arrives for this user, so the shell holds one subscription instead of one
 * per item.
 */
export function NavBadgesProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<NavBadges>(NO_BADGES);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refresh = () =>
      supabase.rpc("nav_badges").then(({ data }) => {
        if (alive && data && typeof data === "object") setBadges({ ...NO_BADGES, ...(data as Partial<NavBadges>) });
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

  return <BadgesContext.Provider value={badges}>{children}</BadgesContext.Provider>;
}
