import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * PRD 5.21 done-when, with real parallel sessions (pgTAP runs in one transaction): two teachers
 * racing for one code check never both get it, one teacher racing for two checks stays inside
 * the weekly limit, and parallel supervision accepts stay inside the supervision cap.
 * Needs the local stack; everything is removed after.
 */
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const admin = postgres(url, { max: 1, onnotice: () => undefined });
const sessions = Array.from({ length: 4 }, () => postgres(url, { max: 1, onnotice: () => undefined }));

const teachers = [randomUUID(), randomUUID(), randomUUID()];
const students = [randomUUID(), randomUUID(), randomUUID()];
const ventures: string[] = [];
const checks: string[] = [];

async function as<T>(session: postgres.Sql, userId: string, query: string, params: unknown[] = []): Promise<T> {
  return session.begin(async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1" })]);
    await tx.unsafe("set local role authenticated");
    const rows = await tx.unsafe(query, params as never[]);
    return rows[0] as T;
  }) as Promise<T>;
}

const code = (error: unknown) => (error as { code?: string }).code;
const tag = randomUUID().slice(0, 8);

beforeAll(async () => {
  for (const [i, id] of teachers.entries()) {
    await admin`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`tc-t${i}-${tag}@nutech.edu.pk`}, '{"role":"faculty"}')`;
  }
  for (const [i, id] of students.entries()) {
    await admin`insert into auth.users (id, email) values (${id}, ${`tc-s${i}-${tag}@nutech.edu.pk`})`;
  }
  await admin`update public.profiles set onboarding_complete = true, username = 'tc_' || left(replace(user_id::text, '-', ''), 12)
              where user_id = any(${[...teachers, ...students]}) and role = 'student'`;
  await admin`insert into public.teacher_profiles (user_id, university_id, department, title, status, approved_at, approval_source)
              select p.user_id, p.university_id, 'CS', 'Lecturer', 'approved', now(), 'staff' from public.profiles p where p.user_id = any(${teachers})`;
  await admin`insert into public.teacher_settings (user_id, grading_opt_in, weekly_grading_cap, grading_skills)
              values (${teachers[0]}, true, 5, '{react}'), (${teachers[1]}, true, 5, '{react}'), (${teachers[2]}, true, 1, '{react}')`;
  for (const student of students) {
    const [c] = await admin<{ id: string }[]>`insert into public.code_checks (user_id, skill_id, status) values (${student}, 'react', 'in_progress') returning id`;
    checks.push(c.id);
  }
  await admin`update public.code_checks set status = 'submitted', submitted_at = now() where id = any(${checks})`;
});

afterAll(async () => {
  await admin`delete from public.code_checks where id = any(${checks})`;
  await admin`delete from public.ventures where id = any(${ventures})`;
  await admin`delete from auth.users where id = any(${[...teachers, ...students]})`;
  await Promise.all([admin.end(), ...sessions.map((s) => s.end())]);
});

describe("teachers under parallel requests", () => {
  it("waits for the university's teachers first", async () => {
    const rows = await admin`select routed_to_staff_at from public.code_checks where id = ${checks[0]}`;
    expect(rows[0].routed_to_staff_at).toBeNull();
  });

  it("never assigns one code check to two teachers", async () => {
    const claims = await Promise.allSettled(
      [0, 1, 0, 1].map((t, i) => as(sessions[i], teachers[t], "select public.teacher_claim_code_check($1, true)", [checks[0]])),
    );
    const done = claims.filter((c) => c.status === "fulfilled").length;
    const holders = await admin`select claimed_by from public.code_checks where id = ${checks[0]}`;
    expect(holders[0].claimed_by).not.toBeNull();
    // The same teacher clicking twice is fine; a second teacher is always refused.
    expect(done).toBeGreaterThanOrEqual(1);
    const refused = claims.filter((c) => c.status === "rejected") as PromiseRejectedResult[];
    for (const r of refused) expect(code(r.reason)).toBe("55000");
    const winner = holders[0].claimed_by as string;
    const loserIndexes = [0, 1].filter((t) => teachers[t] !== winner);
    for (const t of loserIndexes) {
      await expect(as(sessions[0], teachers[t], "select public.teacher_claim_code_check($1, true)", [checks[0]])).rejects.toMatchObject({ code: "55000" });
    }
  });

  it("keeps one teacher inside the weekly limit when claims race", async () => {
    const claims = await Promise.allSettled(
      [1, 2].map((c, i) => as(sessions[i], teachers[2], "select public.teacher_claim_code_check($1, true)", [checks[c]])),
    );
    expect(claims.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    const refused = claims.find((c) => c.status === "rejected") as PromiseRejectedResult;
    expect(code(refused.reason)).toBe("23514");
  });

  it("keeps a teacher inside the supervision cap under parallel accepts", async () => {
    await admin`insert into public.platform_config (key, version, value, reason)
                select 'teacher.limits', coalesce((select max(version) from public.platform_config where key = 'teacher.limits'), 1) + 1,
                       private.config('teacher.limits') || '{"supervisions_max": 1}'::jsonb, 'concurrency test'`;
    try {
      for (const student of students.slice(0, 2)) {
        const { id } = await as<{ id: string }>(
          sessions[0],
          student,
          `select public.create_venture('{"type":"project","title":"Parallel supervise","description":"d"}') as id`,
        );
        ventures.push(id);
        await as(sessions[0], student, "select public.invite_supervisor($1, $2)", [id, teachers[0]]);
      }
      const accepts = await Promise.allSettled(
        ventures.map((v, i) => as(sessions[i], teachers[0], "select public.respond_supervision($1, true)", [v])),
      );
      expect(accepts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
      const refused = accepts.find((a) => a.status === "rejected") as PromiseRejectedResult;
      expect(code(refused.reason)).toBe("23514");
    } finally {
      // The config table is append-only for users, so the test's row goes with a direct delete.
      await admin`alter table public.platform_config disable trigger user`;
      await admin`delete from public.platform_config where key = 'teacher.limits' and reason = 'concurrency test'`;
      await admin`alter table public.platform_config enable trigger user`;
    }
  });
});
