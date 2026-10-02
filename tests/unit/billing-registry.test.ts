import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENTITLEMENT_CHECKED_BUT_FREE, PAID_ACTIONS } from "@/lib/billing/registry";

/**
 * PRD 4b.13: the build fails if a server action that reaches an entitlement-checked SQL write isn't declared in
 * lib/billing/registry.ts with its key (and doesn't call require_entitlement first). The dynamic half, which calls
 * every registered action as a user without the entitlement, is tests/worker/billing-registry.test.ts.
 */
const root = process.cwd();
const migrations = readdirSync(join(root, "supabase", "migrations")).sort().map((f) => readFileSync(join(root, "supabase", "migrations", f), "utf8"));

/** The newest definition of every private function, with its volatility. */
function privateFunctions(): Map<string, { body: string; volatile: boolean }> {
  const out = new Map<string, { body: string; volatile: boolean }>();
  const re = /create (?:or replace )?function private\.([a-z_0-9]+)\(([\s\S]*?)\$\$;/g;
  for (const sql of migrations) {
    for (const m of sql.matchAll(re)) {
      const text = m[0];
      const header = text.slice(0, text.indexOf("$$"));
      out.set(m[1]!, { body: text, volatile: /\bvolatile\b/.test(header) });
    }
  }
  return out;
}

/** Functions whose bodies were rewritten by pg_temp.patch to check an entitlement (20261023_billing_core.sql). */
function patchedToCheck(): Set<string> {
  const out = new Set<string>();
  for (const sql of migrations) {
    for (const stmt of sql.split(/;\n/)) {
      if (!stmt.includes("pg_temp.patch(") || !CHECKS.test(stmt)) continue;
      for (const n of stmt.matchAll(/'private\.([a-z_]+)\(/g)) out.add(n[1]!);
    }
  }
  return out;
}

const CHECKS = /private\.(has_entitlement|org_entitled|uni_entitled|uni_limit|org_limit|consume_quota|require_org_entitled|require_entitlement)\(/;

function paidSqlWrites(): Set<string> {
  const fns = privateFunctions();
  const paid = new Set<string>();
  // Guards such as require_api_admin() check the entitlement for the function that calls them.
  const guards = [...fns].filter(([n, f]) => n.startsWith("require_") && CHECKS.test(f.body)).map(([n]) => n);
  const callsGuard = (body: string) => guards.some((g) => body.includes(`private.${g}(`));
  for (const [name, f] of fns) {
    if (f.volatile && (CHECKS.test(f.body) || callsGuard(f.body)) && !name.startsWith("ops_") && !["consume_quota", "require_org_entitled", "on_hire_recorded"].includes(name)) paid.add(name);
  }
  for (const n of patchedToCheck()) paid.add(n);
  return paid;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

/** Every rpcAction call in lib/actions: its log name, SQL function and entitlement option. */
function actionCalls(): { file: string; name: string; fn: string; entitlement: string | null }[] {
  const out: { file: string; name: string; fn: string; entitlement: string | null }[] = [];
  for (const file of walk(join(root, "lib", "actions"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/rpcAction(?:<[^(]*?>)?\(\{([\s\S]*?)\}\);/g)) {
      const block = m[1]!;
      const name = /name: "([^"]+)"/.exec(block)?.[1];
      const fn = /fn: "([^"]+)"/.exec(block)?.[1];
      if (!name || !fn) continue;
      out.push({ file, name, fn, entitlement: /entitlement: "([^"]+)"/.exec(block)?.[1] ?? null });
    }
  }
  return out;
}

const KEYS = new Set(
  [...migrations.join("\n").matchAll(/\('([a-z][a-z_]*(?:\.[a-z_]+)+)', '(?:user|org|university)', '(?:bool|int|limit|enum)'/g)].map((m) => m[1]!),
);

describe("paid action registry", () => {
  const paid = paidSqlWrites();
  const calls = actionCalls();

  it("finds the entitlement-checked writes", () => {
    for (const fn of ["send_contact_request", "create_shortlist", "add_note", "save_search", "save_job_fair", "save_hackathon", "create_api_token"]) {
      expect(paid.has(fn), fn).toBe(true);
    }
  });

  it("every action that reaches a paid write is registered and asks for its entitlement first", () => {
    const missing = calls
      .filter((c) => paid.has(c.fn) && !(c.fn in ENTITLEMENT_CHECKED_BUT_FREE))
      .filter((c) => !c.entitlement || !PAID_ACTIONS.some((a) => a.name === c.name && a.key === c.entitlement))
      .map((c) => `${c.name} → ${c.fn}`);
    expect(missing).toEqual([]);
  });

  it("every registered action exists, calls its SQL function and names a real key", () => {
    for (const a of PAID_ACTIONS) {
      expect(KEYS.has(a.key), a.key).toBe(true);
      if (!a.sql) continue;
      const call = calls.find((c) => c.name === a.name);
      expect(call, a.name).toBeDefined();
      expect(call!.fn).toBe(a.sql);
      expect(call!.entitlement).toBe(a.key);
    }
    const cv = readFileSync(join(root, "lib", "actions", "cv.ts"), "utf8");
    expect(cv).toContain('paymentRequired(ctx, session.supabase, session.userId, "cv.refresh_on_demand")');
  });

  it("exemptions are real SQL functions", () => {
    const fns = privateFunctions();
    for (const name of Object.keys(ENTITLEMENT_CHECKED_BUT_FREE)) expect(fns.has(name), name).toBe(true);
  });
});
