import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * PRD 5.8 done-when, with real parallel sessions (pgTAP runs in one transaction):
 * duplicate friend requests are impossible under parallel sends, in the same direction or
 * crossing. Needs the local stack; everything is removed after.
 */
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const admin = postgres(url, { max: 1, onnotice: () => undefined });
const sessions = [postgres(url, { max: 1, onnotice: () => undefined }), postgres(url, { max: 1, onnotice: () => undefined })];

const users = Array.from({ length: 4 }, () => randomUUID());
const names = users.map((id) => `fc_${id.replace(/-/g, "").slice(0, 12)}`);

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

async function livePairRows(a: string, b: string): Promise<number> {
  const [{ n }] = await admin<{ n: number }[]>`
    select count(*)::int as n from public.friend_requests
     where status in ('pending', 'accepted')
       and least(sender_id, receiver_id) = least(${a}::uuid, ${b}::uuid)
       and greatest(sender_id, receiver_id) = greatest(${a}::uuid, ${b}::uuid)`;
  return n;
}

beforeAll(async () => {
  for (const [i, id] of users.entries()) {
    await admin`insert into auth.users (id, email) values (${id}, ${`fc-${i}-${id.slice(0, 8)}@nutech.edu.pk`})`;
    await admin`update public.profiles set onboarding_complete = true, username = ${names[i]} where user_id = ${id}`;
  }
});

afterAll(async () => {
  await admin`delete from auth.users where id = any(${users})`;
  await Promise.all([admin.end(), ...sessions.map((s) => s.end())]);
});

describe("friend requests under parallel sends", () => {
  it("keeps one request when the same person clicks twice at once", async () => {
    const clicks = await Promise.allSettled(
      sessions.map((s) => as(s, users[0], "select * from public.send_friend_request($1)", [names[1]])),
    );
    expect(clicks.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    const refused = clicks.find((c) => c.status === "rejected") as PromiseRejectedResult;
    expect(["23505", "54000"]).toContain(code(refused.reason));
    expect(await livePairRows(users[0], users[1])).toBe(1);
  });

  it("keeps one request when two people ask each other at the same moment", async () => {
    const sends = await Promise.allSettled([
      as(sessions[0], users[2], "select * from public.send_friend_request($1)", [names[3]]),
      as(sessions[1], users[3], "select * from public.send_friend_request($1)", [names[2]]),
    ]);
    expect(sends.filter((c) => c.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    for (const s of sends) if (s.status === "rejected") expect(code(s.reason)).toBe("23505");
    expect(await livePairRows(users[2], users[3])).toBe(1);
  });
});
