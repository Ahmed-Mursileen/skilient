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

async function timed(check: Check): Promise<CheckResult> {
  const started = performance.now();
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    // Error codes only: never echo connection strings or payloads.
    const error = err instanceof Error && err.message === "timeout" ? "timeout" : "unavailable";
    return { ok: false, ms: Math.round(performance.now() - started), error };
  }
}

export async function runHealthChecks(checks: Record<CheckName, Check>): Promise<HealthReport> {
  const names = Object.keys(checks) as CheckName[];
  const results = await Promise.all(names.map((n) => timed(checks[n])));
  const report = Object.fromEntries(names.map((n, i) => [n, results[i]])) as Record<CheckName, CheckResult>;
  return { ok: results.every((r) => r.ok), checks: report };
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
    realtime: () => expectOk(`${base}/realtime/v1/api/ping`, key),
  };
}
