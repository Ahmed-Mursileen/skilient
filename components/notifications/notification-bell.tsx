"use client";

import { Bell } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Header bell with the unread count (PRD 5.11): read from unread_notification_count(),
 * refreshed live by a Realtime subscription on the user's own notifications and on each
 * navigation.
 */
export function NotificationBell({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refresh = () =>
      supabase.rpc("unread_notification_count").then(({ data }) => {
        if (alive && typeof data === "number") setCount(data);
      });
    void refresh();
    // Realtime applies RLS with the socket's token: load the signed-in JWT before joining.
    void supabase.realtime.setAuth().then(() => {
      if (!alive) return;
      channel = supabase
        .channel(`notifications:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
          void refresh();
        })
        .subscribe();
    });
    return () => {
      alive = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, pathname]);

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      title="Notifications"
      className="relative inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
      data-testid="notification-bell"
    >
      <Bell aria-hidden weight="bold" className="size-5" />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[11px] leading-4 font-semibold text-text-on-primary"
          data-testid="notification-count"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
