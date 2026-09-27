import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { readPublicEnv, type PublicEnv } from "@/lib/env";

export type CheckName = "database" | "storage" | "realtime";
export interface CheckResult {
  ok: boolean;
  ms: number;
  error?: string;
}
export type HealthReport = { ok: boolean; checks: Record<CheckName, CheckResult> };

type Check = () => Promise<void>;

const TIMEOUT_MS = 3000;
/** Realtime needs a WebSocket handshake plus a channel join, so it gets longer. */
const REALTIME_TIMEOUT_MS = 5000;
const timeouts: Partial<Record<CheckName, number>> = { realtime: REALTIME_TIMEOUT_MS + 500 };

async function timed(check: Check, timeoutMs = TIMEOUT_MS): Promise<CheckResult> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    // Error codes only: never echo connection strings or payloads.
    const error = err instanceof Error && err.message === "timeout" ? "timeout" : "unavailable";
    return { ok: false, ms: Math.round(performance.now() - started), error };
  } finally {
    clearTimeout(timer);
  }
}

export async function runHealthChecks(checks: Record<CheckName, Check>): Promise<HealthReport> {
  const names = Object.keys(checks) as CheckName[];
  const results = await Promise.all(names.map((n) => timed(checks[n], timeouts[n])));
  const report = Object.fromEntries(names.map((n, i) => [n, results[i]])) as Record<CheckName, CheckResult>;
  return { ok: results.every((r) => r.ok), checks: report };
}

/**
 * End-to-end Realtime probe: join a throwaway public channel over the WebSocket
 * (`/realtime/v1/websocket`, the path the app itself uses) and wait for SUBSCRIBED.
 * Hosted projects don't expose Realtime's internal HTTP ping.
 */
export async function realtimeProbe(base: string, key: string, timeoutMs = REALTIME_TIMEOUT_MS): Promise<void> {
  const supabase = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const channel = supabase.channel(`health-${crypto.randomUUID()}`);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(timer);
          reject(new Error(status));
        }
      });
    });
  } finally {
    await supabase.removeAllChannels();
    supabase.realtime.disconnect();
  }
}

async function expectOk(url: string, key: string) {
  const res = await fetch(url, { headers: { apikey: key }, cache: "no-store" });
  if (!res.ok) throw new Error(`status ${res.status}`);
}

/** Live checks against Supabase with the publishable key: no service role needed. */
export function supabaseChecks(env: PublicEnv | null = readPublicEnv()): Record<CheckName, Check> {
  if (!env) {
    const missing: Check = async () => {
      throw new Error("supabase env missing");
    };
    return { database: missing, storage: missing, realtime: missing };
  }
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return {
    database: async () => {
      const supabase = createClient<Database>(base, key, { auth: { persistSession: false } });
      const { data, error } = await supabase.rpc("health_check");
      if (error || data !== true) throw new Error("db");
    },
    storage: () => expectOk(`${base}/storage/v1/status`, key),
    realtime: () => realtimeProbe(base, key),
  };
}
