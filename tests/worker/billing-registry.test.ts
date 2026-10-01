import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PAID_ACTIONS } from "@/lib/billing/registry";
import { jwt, localStack, sql } from "./billing-support.ts";

/**
 * PRD 4b.13: every registered paid server action, called as a user without the entitlement, refuses with
 * `payment_required` before it changes anything. The real actions run against the local stack: only the Next
 * request (headers, cookies, revalidation) is replaced, and the Supabase client carries a signed session for
 * a free student, an Explore organisation's admin or a free university's owner (two-factor where needed).
 */
const state = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "127.0.0.1:3000", "x-forwarded-proto": "http" }),
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  const { localStack: stack } = await import("./billing-support.ts");
  const { api, anonKey } = stack();
  return {
    createClient: async () => {
      const client = make(api, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${state.token}` } } });
      const getUser = client.auth.getUser.bind(client.auth);
      client.auth.getUser = (token?: string) => getUser(token ?? state.token);
      return client;
    },
  };
});

const { api, jwtSecret } = localStack();
const serviceKey = (() => {
  if (process.env.E2E_SUPABASE_SECRET_KEY) return process.env.E2E_SUPABASE_SECRET_KEY;
  const line = execSync("pnpm exec supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .find((l) => l.startsWith("SERVICE_ROLE_KEY="));
  return (line ?? "").split("=")[1]!.replace(/"/g, "");
})();
const admin: SupabaseClient = createClient(api, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const t = randomUUID().slice(0, 8);
const users: string[] = [];
const subjects: Record<"user" | "org" | "university", { id: string; aal: "aal1" | "aal2" }> = {} as never;
let orgId = "";
let uniId = "";

async function makeUser(email: string, meta: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: `Pw-${randomUUID()}`, email_confirm: true, user_metadata: meta });
  if (error || !data.user) throw error ?? new Error("no user");
  users.push(data.user.id);
  return data.user.id;
}

beforeAll(async () => {
  const student = await makeUser(`reg-${t}@nutech.edu.pk`, {});
  await sql`update public.profiles set onboarding_complete = true, username = ${`reg_${t}`}, department = 'Computer Science', graduation_year = 2030 where user_id = ${student}`;
  subjects.user = { id: student, aal: "aal1" };

  const domain = `reg-${t}.example.com`;
  const recruiter = await makeUser(`admin@${domain}`, { role: "recruiter", full_name: "Registry Admin" });
  orgId = randomUUID();
  await sql`insert into public.organizations (id, slug, name, domain, website, industry, size, city, signer_role, status, province, created_by)
            values (${orgId}, ${`reg-${t}`}, 'Registry Co', ${domain}, ${`https://${domain}`}, 'Software', '1-10', 'Lahore', 'CEO', 'verified', 'Punjab', ${recruiter})`;
  await sql`insert into public.org_members (org_id, user_id, role) values (${orgId}, ${recruiter}, 'admin')`;
  subjects.org = { id: recruiter, aal: "aal2" };

  // A claimed university on the free plan, so its hackathon and fair allowances are zero.
  const [uni] = await sql`select u.id from public.universities u where u.owner_id is null and exists (select 1 from public.university_domains d where d.university_id = u.id)
                           order by u.name offset 3 limit 1`;
  uniId = uni!.id as string;
  const [{ domain: uniDomain }] = await sql`select domain from public.university_domains where university_id = ${uniId} limit 1`;
  const owner = await makeUser(`owner-${t}@${uniDomain}`, { role: "university_admin", full_name: "Registry Owner", university_id: uniId });
  await sql`insert into public.university_admins (user_id, university_id, role) values (${owner}, ${uniId}, 'owner')`;
  await sql`update public.universities set owner_id = ${owner}, claimed_at = now() where id = ${uniId}`;
  subjects.university = { id: owner, aal: "aal2" };
});

afterAll(async () => {
  await sql`update public.universities set owner_id = null, claimed_at = null where id = ${uniId}`;
  await sql`delete from public.university_admins where university_id = ${uniId}`;
  await sql`delete from public.organizations where id = ${orgId}`;
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await sql.end();
});

const id = () => randomUUID();
const later = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 16);
const rubric = [{ criterion: "Correctness", weight: 60 }, { criterion: "Clarity", weight: 40 }];
const brief = "Build a small service that does one thing well and explain the trade-offs you made. ".repeat(2);

/** A valid input for every registered action, so Zod passes and the entitlement check is what answers. */
const SAMPLES: Record<string, (m: Record<string, (...a: never[]) => Promise<unknown>>) => Promise<unknown>> = {
  "recruit.create_shortlist": (m) => m.createShortlist!("Backend" as never),
  "recruit.rename_shortlist": (m) => (m.renameShortlist as (a: string, b: string) => Promise<unknown>)(id(), "Backend"),
  "recruit.shortlist_add": (m) => (m.addToShortlist as (a: string, b: string) => Promise<unknown>)(id(), id()),
  "recruit.shortlist_reorder": (m) => (m.reorderShortlist as (a: string, b: string[]) => Promise<unknown>)(id(), [id()]),
  "recruit.add_note": (m) => (m.addNote as (a: string, b: string) => Promise<unknown>)(id(), "Strong systems work."),
  "recruit.send_contact": (m) => (m.sendContactRequest as (a: unknown) => Promise<unknown>)({ studentId: id(), role: "Backend intern", message: "We would like to talk to you about a backend internship in Lahore this winter." }),
  "recruit.save_search": (m) => (m.saveSearch as (a: string, b: unknown, c: string) => Promise<unknown>)("React", {}, "weekly"),
  "recruit.save_competition": (m) =>
    (m.saveCompetition as (a: null, b: unknown) => Promise<unknown>)(null, {
      title: "API challenge", role: "Backend", skills: [{ skill: "python", min_level: 2 }], brief, briefTemplate: "custom",
      startsOn: later(10).slice(0, 10), endsOn: later(20).slice(0, 10), teamSize: 2, universities: [], minTier: "", prize: "Winner badge", rubric,
    }),
  "recruit.create_token": (m) => (m.createApiToken as (a: string) => Promise<unknown>)("ATS"),
  "recruit.create_webhook": (m) => (m.createWebhook as (a: string, b: string[]) => Promise<unknown>)("https://hooks.example.com/in", ["application.created"]),
  "uni.hackathon": (m) =>
    (m.saveHackathon as (a: unknown) => Promise<unknown>)({
      title: "Campus hack", brief, startsAt: later(10), endsAt: later(12), teamSize: 3, skills: ["python"], prize: "Winner badge", rubric, openToAll: false, judges: [id()],
    }),
  "uni.fair": (m) => (m.saveFair as (a: unknown) => Promise<unknown>)({ title: "Winter job fair", startsAt: later(10), endsAt: later(11) }),
  "cv.refresh": (m) => (m.refreshCv as () => Promise<unknown>)(),
};

describe("every registered paid action refuses without its entitlement", () => {
  it("has a sample for every registered action", () => {
    expect(PAID_ACTIONS.filter((a) => !SAMPLES[a.name]).map((a) => a.name)).toEqual([]);
  });

  for (const action of PAID_ACTIONS) {
    it(`${action.name} (${action.key})`, async () => {
      const who = subjects[action.subject];
      state.token = jwt(who.id, jwtSecret, who.aal);
      const mod = (await import(`@/lib/actions/${action.module}.ts`)) as Record<string, (...a: never[]) => Promise<unknown>>;
      expect(typeof mod[action.exportName]).toBe("function");
      const result = (await SAMPLES[action.name]!(mod)) as { ok: boolean; code?: string; message?: string };
      expect(result, JSON.stringify(result)).toMatchObject({ ok: false, code: "payment_required" });
    });
  }
});
