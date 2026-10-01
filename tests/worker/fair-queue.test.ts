import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * PRD 5.23 done-when: a job-fair queue stays consistent with 200 concurrent students. Each student
 * calls join_fair_queue through PostgREST (the same path as the app) at the same moment; the
 * positions must be exactly 1..200, no gaps, no repeats, one row per student. Needs the local stack;
 * everything is removed after.
 */
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
/** The local stack's URL, anon key and JWT secret: from the environment, else from `supabase status` (nothing committed). */
function localStack(): { api: string; anonKey: string; jwtSecret: string } {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_JWT_SECRET) {
    return { api: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, jwtSecret: process.env.SUPABASE_JWT_SECRET };
  }
  const env = Object.fromEntries(
    execSync("pnpm exec supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
  return { api: env.API_URL, anonKey: env.ANON_KEY, jwtSecret: env.JWT_SECRET };
}
const { api, anonKey, jwtSecret } = localStack();
const admin = postgres(url, { max: 1, onnotice: () => undefined });

const N = 200;
const tag = randomUUID().slice(0, 8);
const students = Array.from({ length: N }, () => randomUUID());
const recruiter = randomUUID();
let universityId = "";
let fairId = "";
let boothId = "";
let orgId = "";

function token(sub: string): string {
  const b = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = b({ alg: "HS256", typ: "JWT" });
  const body = b({ sub, role: "authenticated", aal: "aal1", exp: Math.floor(Date.now() / 1000) + 600 });
  const sig = createHmac("sha256", jwtSecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

async function rpc(sub: string, fn: string, args: object): Promise<{ status: number; body: unknown }> {
  const client = createClient(api, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token(sub)}` } },
  });
  const { data, error, status } = await client.rpc(fn, args);
  return { status: error ? (status >= 400 ? status : 400) : 200, body: data };
}

beforeAll(async () => {
  const [u] = await admin<{ university_id: string }[]>`select university_id from public.university_domains where domain = 'nutech.edu.pk' limit 1`;
  universityId = u.university_id;
  await admin`insert into auth.users (id, email, raw_user_meta_data) values (${recruiter}, ${`fq-${tag}@fairco-${tag}.com`}, '{"role":"recruiter"}')`;
  const [o] = await admin<{ id: string }[]>`
    insert into public.organizations (slug, name, domain, website, industry, size, city, signer_role, status)
    values (${`fairco-${tag}`}, 'Fair Co', ${`fairco-${tag}.com`}, ${`https://fairco-${tag}.com`}, 'Software', '11-50', 'Islamabad', 'HR', 'verified')
    returning id`;
  orgId = o.id;
  await admin`insert into public.org_members (org_id, user_id, role) values (${orgId}, ${recruiter}, 'admin')`;
  for (let i = 0; i < N; i += 50) {
    const batch = students.slice(i, i + 50);
    await admin`insert into auth.users ${admin(batch.map((id, j) => ({ id, email: `fq-${i + j}-${tag}@nutech.edu.pk` })))}`;
  }
  await admin`update public.profiles set onboarding_complete = true, username = 'fq_' || left(replace(user_id::text, '-', ''), 12)
              where user_id = any(${students})`;
  const [f] = await admin<{ id: string }[]>`
    insert into public.job_fairs (university_id, title, starts_at, ends_at, status)
    values (${universityId}, 'Load fair', now() - interval '1 hour', now() + interval '5 hours', 'published') returning id`;
  fairId = f.id;
  const [b] = await admin<{ id: string }[]>`insert into public.job_fair_booths (fair_id, org_id) values (${fairId}, ${orgId}) returning id`;
  boothId = b.id;
}, 120_000);

afterAll(async () => {
  if (fairId) await admin`delete from public.job_fairs where id = ${fairId}`;
  await admin`delete from auth.users where id = any(${[...students, recruiter]})`;
  if (orgId) await admin`delete from public.organizations where id = ${orgId}`;
  await admin.end();
});

describe("job-fair queue under 200 concurrent students", () => {
  it("hands out positions 1..200 with no gaps or repeats", async () => {
    const results = await Promise.all(students.map((s) => rpc(s, "join_fair_queue", { p_booth: boothId })));
    const failed = results.filter((r) => r.status !== 200);
    expect(failed).toEqual([]);
    const returned = results.map((r) => r.body as number).sort((a, c) => a - c);
    expect(returned).toEqual(Array.from({ length: N }, (_, i) => i + 1));

    const rows = await admin<{ position: number; student_id: string }[]>`
      select position, student_id from public.job_fair_queue where booth_id = ${boothId} order by position`;
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect(new Set(rows.map((r) => r.student_id)).size).toBe(N);
    const [booth] = await admin<{ next_position: number }[]>`select next_position from public.job_fair_booths where id = ${boothId}`;
    expect(booth.next_position).toBe(N + 1);
  }, 120_000);

  it("refuses a second join by the same student, even in parallel", async () => {
    const twice = await Promise.all([0, 1, 2].map(() => rpc(students[0], "join_fair_queue", { p_booth: boothId })));
    expect(twice.every((r) => r.status !== 200)).toBe(true);
    const [n] = await admin<{ n: number }[]>`select count(*)::int as n from public.job_fair_queue where booth_id = ${boothId} and student_id = ${students[0]}`;
    expect(n.n).toBe(1);
  });

  it("a student who leaves disappears from the company's view at once", async () => {
    await rpc(students[1], "leave_fair_booth", { p_booth: boothId });
    const rows = await admin.begin(async (tx) => {
      await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: recruiter, role: "authenticated", aal: "aal2" })]);
      await tx.unsafe("set local role authenticated");
      return tx.unsafe("select student_id from public.job_fair_queue where booth_id = $1", [boothId]);
    });
    expect(rows.length).toBe(N - 1);
    expect(rows.some((r) => r.student_id === students[1])).toBe(false);
  });
});
