import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * PRD 5.7/5.28 done-when, with real parallel sessions (pgTAP runs in one transaction):
 * a 7th member can't join under parallel accepts, and duplicate pending applications are
 * impossible under parallel clicks. Needs the local stack; everything is removed after.
 */
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const admin = postgres(url, { max: 1, onnotice: () => undefined });
const sessions = [postgres(url, { max: 1, onnotice: () => undefined }), postgres(url, { max: 1, onnotice: () => undefined })];

const users = Array.from({ length: 8 }, () => randomUUID());
const [owner, ...others] = users;
let venture = "";

/** Runs `query` as `userId` in its own transaction on the given session. */
async function as<T>(session: postgres.Sql, userId: string, query: string, params: unknown[] = []): Promise<T> {
  return session.begin(async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await tx.unsafe("set local role authenticated");
    const rows = await tx.unsafe(query, params as never[]);
    return rows[0] as T;
  }) as Promise<T>;
}

function code(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

beforeAll(async () => {
  for (const [i, id] of users.entries()) {
    await admin`insert into auth.users (id, email) values (${id}, ${`vc-${i}-${id.slice(0, 8)}@nutech.edu.pk`})`;
  }
  await admin`update public.profiles set onboarding_complete = true, username = 'vc_' || left(replace(user_id::text, '-', ''), 12)
              where user_id = any(${users})`;
  ({ id: venture } = await as<{ id: string }>(
    sessions[0],
    owner,
    `select public.create_venture('{"type":"project","title":"Parallel","description":"d","team_size":6}') as id`,
  ));
});

afterAll(async () => {
  await admin`delete from public.ventures where id = ${venture}`;
  await admin`delete from auth.users where id = any(${users})`;
  await Promise.all([admin.end(), ...sessions.map((s) => s.end())]);
});

describe("ventures under parallel requests", () => {
  it("refuses a duplicate pending application from two parallel clicks", async () => {
    const clicks = await Promise.allSettled(
      sessions.map((s) => as(s, others[0], "select public.apply_to_venture($1, 'hi') as id", [venture])),
    );
    expect(clicks.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    const refused = clicks.find((c) => c.status === "rejected") as PromiseRejectedResult;
    expect(code(refused.reason)).toBe("23505");
  });

  it("lets only one of two parallel accepts take the 6th place", async () => {
    // Six applications in all (one from the test above); accept four one by one, so the owner
    // plus four make five members, then two parallel accepts race for the last place.
    for (const user of others.slice(1, 6)) {
      await as(sessions[0], user, "select public.apply_to_venture($1, 'hi')", [venture]);
    }
    const threads = await admin<{ id: string; candidate_id: string }[]>`
      select id, candidate_id from public.application_threads where venture_id = ${venture} and status = 'pending'
      order by created_at`;
    for (const t of threads.slice(0, threads.length - 2)) {
      await as(sessions[0], owner, "select public.decide_application($1, true)", [t.id]);
    }
    const [{ n: before }] = await admin<{ n: number }[]>`select count(*)::int as n from public.venture_members where venture_id = ${venture}`;
    expect(before).toBe(5);

    const last = threads.slice(-2);
    const accepts = await Promise.allSettled(
      last.map((t, i) => as(sessions[i], owner, "select public.decide_application($1, true)", [t.id])),
    );
    expect(accepts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(code((accepts.find((a) => a.status === "rejected") as PromiseRejectedResult).reason)).toBe("23514");
    const [{ n: after }] = await admin<{ n: number }[]>`select count(*)::int as n from public.venture_members where venture_id = ${venture}`;
    expect(after).toBe(6);
  });
});
