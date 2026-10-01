import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCompetitionFreeze } from "../../supabase/functions/_shared/competitions/freeze.ts";
import { dbFrom } from "../../supabase/functions/_shared/github/types.ts";

/** At the deadline each submitted repository's latest commit is recorded where GitHub lets us read it (PRD 5.20). */
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => undefined });
const db = dbFrom(sql);
const log = () => undefined;
const org = randomUUID();
const comp = randomUUID();
const lead = randomUUID();
const teams = { open: randomUUID(), hidden: randomUUID(), flaky: randomUUID(), nosubmit: randomUUID() };
const SHA = "0123456789abcdef0123456789abcdef01234567";

beforeAll(async () => {
  await sql`insert into auth.users (id, email) values (${lead}, ${`cf-${lead.slice(0, 8)}@nutech.edu.pk`})`;
  await sql`insert into public.organizations (id, slug, name, domain, website, industry, size, city, signer_role, status)
            values (${org}, ${`cf-${org.slice(0, 8)}`}, 'Freeze Co', ${`freeze-${org.slice(0, 8)}.example.com`}, ${`https://freeze-${org.slice(0, 8)}.example.com`}, 'Software', '1-10', 'Lahore', 'CTO', 'verified')`;
  await sql`insert into public.competitions (id, org_id, title, role, skills, brief, starts_at, ends_at, team_size, prize, rubric, status)
            values (${comp}, ${org}, 'Freeze test', 'Dev', '[{"skill":"react","min_level":1}]', ${"b".repeat(120)}, now() - interval '9 days', now() - interval '1 hour', 2, 'A prize',
                    '[{"criterion":"A","weight":50},{"criterion":"B","weight":50}]', 'frozen')`;
  await sql`insert into public.competition_teams (id, competition_id, name, lead_id, repo_url, submitted_at) values
    (${teams.open}, ${comp}, 'Open', ${lead}, 'https://github.com/team/open', now() - interval '2 days'),
    (${teams.hidden}, ${comp}, 'Hidden', ${lead}, 'https://github.com/team/hidden', now() - interval '2 days'),
    (${teams.flaky}, ${comp}, 'Flaky', ${lead}, 'https://github.com/team/flaky', now() - interval '2 days')`;
  await sql`insert into public.competition_teams (id, competition_id, name, lead_id) values (${teams.nosubmit}, ${comp}, 'Nothing', ${lead})`;
});
afterAll(async () => {
  await sql`delete from public.organizations where id = ${org}`;
  await sql`delete from auth.users where id = ${lead}`;
  await sql.end();
});

describe("competition freeze", () => {
  it("records the latest commit, marks private repositories unreadable and retries transient failures", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/team/open/")) return Response.json([{ sha: SHA }]);
      if (url.includes("/team/hidden/")) return new Response("{}", { status: 404 });
      return new Response("", { status: 502 });
    }) as typeof fetch;
    expect(await runCompetitionFreeze({ db, fetch: fetchImpl, log })).toEqual({ recorded: 1, unreadable: 1, retry: 1 });
    const rows = await sql`select name, frozen_sha, frozen_checked_at is not null as checked, frozen_note from public.competition_teams where competition_id = ${comp} order by name`;
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by.Open).toMatchObject({ frozen_sha: SHA, checked: true });
    expect(by.Hidden).toMatchObject({ frozen_sha: null, checked: true });
    expect(by.Hidden!.frozen_note).toMatch(/not readable/);
    expect(by.Flaky).toMatchObject({ frozen_sha: null, checked: false });
    expect(by.Nothing).toMatchObject({ checked: false });
    // The next tick only retries what is left.
    const ok = (async () => Response.json([{ sha: SHA }])) as typeof fetch;
    expect(await runCompetitionFreeze({ db, fetch: ok, log })).toEqual({ recorded: 1, unreadable: 0, retry: 0 });
  });
});
