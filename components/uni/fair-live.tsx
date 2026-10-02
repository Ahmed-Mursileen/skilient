"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps a fair page current: Realtime changes on job_fair_queue (RLS shows a student their own rows
 * and a company its own queue) refresh the page, with a 15-second refresh as a fallback.
 */
export function FairLive({ channel }: { channel: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    void supabase.realtime.setAuth().then(() => {
      if (!alive) return;
      ch = supabase
        .channel(`fair:${channel}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "job_fair_queue" }, () => router.refresh())
        .subscribe();
    });
    const t = setInterval(() => router.refresh(), 15_000);
    return () => {
      alive = false;
      clearInterval(t);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [channel, router]);
  return null;
}
