import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * PRD 4b.13 (B1 done-when): 50 parallel spends against 1 remaining contact credit → exactly 1 succeeds. Each
 * request is its own connection and transaction, as 50 recruiters clicking at once would be; `consume_quota` locks
 * the period's counter row, so the second spender waits and then sees none left.
 */
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const admin = postgres(url, { max: 1, onnotice: () => undefined });
const pool = postgres(url, { max: 50, onnotice: () => undefined });
const org = randomUUID();
const t = org.slice(0, 8);

beforeAll(async () => {
  await admin`insert into public.organizations (id, slug, name, domain, website, industry, size, city, signer_role, status)
              values (${org}, ${`cc-${t}`}, 'Concurrency Co', ${`cc-${t}.example.com`}, ${`https://cc-${t}.example.com`}, 'Software', '1-10', 'Lahore', 'CEO', 'verified')`;
  // One credit on the plan this period, one already spent, plus one purchased credit: 1 left in total.
  await admin`insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason)
              values ('org', ${org}, 'contact.credits', '1', 'admin', now() + interval '1 day', 'concurrency test')`;
  await admin`select private.consume_quota('org', ${org}, 'contact.credits', 1)`;
  await admin`insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at)
              values ('org', ${org}, 'contact.credits', '1', 'add_on', now() + interval '90 days')`;
});
afterAll(async () => {
  await admin`delete from public.organizations where id = ${org}`;
  await Promise.all([admin.end(), pool.end()]);
});

describe("contact credits under load", () => {
  it("50 parallel spends against 1 remaining credit: exactly 1 succeeds", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => pool.begin((tx) => tx`select private.consume_quota(${org}::uuid, 'contact.credits', 1)`)),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(refused).toHaveLength(49);
    expect(refused.every((r) => (r.reason as { code?: string }).code === "PT402")).toBe(true);
    const [{ remaining }] = await admin`select (private.quota_status('org', ${org}, 'contact.credits') ->> 'remaining')::int as remaining`;
    expect(remaining).toBe(0);
  });
});
