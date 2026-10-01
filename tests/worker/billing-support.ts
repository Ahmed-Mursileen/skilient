import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";
import { dbFrom } from "../../supabase/functions/_shared/github/types.ts";

/** Shared by the billing worker tests: the local database, users and organisations, and acting as someone. */
export const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 4, onnotice: () => undefined });
export const db = dbFrom(sql);

export function localStack(): { api: string; anonKey: string; jwtSecret: string } {
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

export function jwt(sub: string, jwtSecret: string, aal: "aal1" | "aal2" = "aal1"): string {
  const b = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = b({ alg: "HS256", typ: "JWT" });
  const body = b({ sub, role: "authenticated", aud: "authenticated", aal, exp: Math.floor(Date.now() / 1000) + 900 });
  return `${head}.${body}.${createHmac("sha256", jwtSecret).update(`${head}.${body}`).digest("base64url")}`;
}

/** Runs SQL as a signed-in user (the same claims PostgREST sets), in one transaction. */
export async function asUser<T>(user: string, aal: "aal1" | "aal2", fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, role: "authenticated", aal })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  })) as T;
}

export const tag = () => randomUUID().slice(0, 8);

export async function student(t: string, n = 1): Promise<string> {
  const id = randomUUID();
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`bw${n}-${t}@nutech.edu.pk`}, '{}')`;
  await sql`update public.profiles set onboarding_complete = true, username = ${`bw${n}_${t}`}, full_name = ${`Billing Student ${n}`},
            department = 'Computer Science', graduation_year = 2030 where user_id = ${id}`;
  return id;
}

export async function orgWithAdmin(t: string): Promise<{ org: string; admin: string }> {
  const org = randomUUID();
  const admin = randomUUID();
  const domain = `bw-${t}.example.com`;
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${admin}, ${`admin@${domain}`}, ${sql.json({ role: "recruiter", full_name: "Billing Admin" })})`;
  await sql`insert into public.organizations (id, slug, name, domain, website, industry, size, city, signer_role, status, province, created_by)
            values (${org}, ${`bw-${t}`}, ${`BW ${t}`}, ${domain}, ${`https://${domain}`}, 'Software', '11-50', 'Lahore', 'CEO', 'verified', 'Punjab', ${admin})`;
  await sql`insert into public.org_members (org_id, user_id, role) values (${org}, ${admin}, 'admin')`;
  return { org, admin };
}

export async function cleanup(users: string[], orgs: string[]) {
  for (const o of orgs) {
    await sql`delete from public.checkout_sessions where subject_id = ${o}`;
    await sql`delete from public.organizations where id = ${o}`;
  }
  for (const u of users) {
    await sql`delete from public.checkout_sessions where subject_id = ${u} or created_by = ${u}`;
    await sql`delete from auth.users where id = ${u}`;
  }
}
