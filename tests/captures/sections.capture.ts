import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import sharp from "sharp";
import { createStudent, signInWithPassword } from "../e2e/support";

/**
 * Landing-section captures (docs/marketing-design-plan.md B5, slice 2): a venture's team with open
 * roles, the jobs list and a contact request, from the built app with fictional sample content
 * seeded straight into the local database (never production). Merged into content/captures.json.
 */

const OUT = path.join(process.cwd(), "public/marketing/captures");
const MANIFEST = path.join(process.cwd(), "content/captures.json");
const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Theme = "light" | "dark";

async function encode(name: string, theme: Theme, png: Buffer) {
  await sharp(png).avif({ quality: 62, effort: 6 }).toFile(path.join(OUT, `${name}-${theme}.avif`));
  await sharp(png).webp({ quality: 80 }).toFile(path.join(OUT, `${name}-${theme}.webp`));
  return { avif: `/marketing/captures/${name}-${theme}.avif`, webp: `/marketing/captures/${name}-${theme}.webp` };
}

async function setTheme(page: Page, theme: Theme) {
  await page.evaluate((t) => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(t);
    document.documentElement.style.colorScheme = t;
  }, theme);
  await page.waitForTimeout(150);
}

async function hideChrome(page: Page) {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") el.style.setProperty("visibility", "hidden", "important");
    }
  });
}

async function shootClip(page: Page, name: string, clip: { x: number; y: number; width: number; height: number }) {
  const out: Record<string, unknown> = { w: Math.round(clip.width), h: Math.round(clip.height) };
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    out[theme] = await encode(name, theme, await page.screenshot({ clip, animations: "disabled", caret: "hide" }));
  }
  await setTheme(page, "light");
  return out;
}

async function shoot(page: Page, name: string, el: Locator, maxHeight?: number) {
  await el.scrollIntoViewIfNeeded();
  const box = (await el.boundingBox())!;
  const clip = { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, maxHeight ?? box.height) };
  const out: Record<string, unknown> = { w: Math.round(clip.width), h: Math.round(clip.height) };
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    out[theme] = await encode(name, theme, await page.screenshot({ clip, animations: "disabled", caret: "hide" }));
  }
  await setTheme(page, "light");
  return out;
}

test("sections: venture team, jobs and a contact request", async ({ browser }) => {
  test.setTimeout(240_000);
  await mkdir(OUT, { recursive: true });
  const sql = postgres(DB_URL, { max: 1, onnotice: () => undefined });
  try {
    // Fictional people (decisions 2026-10-02).
    const owner = await createStudent({ domain: "nutech.edu.pk", fullName: "Ayesha Siddiqui" });
    const members = [
      await createStudent({ domain: "nutech.edu.pk", fullName: "Bilal Ahmed" }),
      await createStudent({ domain: "nutech.edu.pk", fullName: "Mariam Javed" }),
      await createStudent({ domain: "nutech.edu.pk", fullName: "Hamza Khan" }),
    ];
    const viewer = await createStudent({ domain: "nutech.edu.pk", fullName: "Zainab Qureshi" });
    const [{ university_id }] = await sql`select university_id from public.profiles where user_id = ${owner.id}`;
    // The viewer has seen the first-visit tips, so the captures show the pages themselves.
    await sql`insert into public.tips_seen (user_id, tip_id) select ${viewer.id}, t from unnest(array['opportunities', 'venture', 'cv', 'score', 'privacy']) t on conflict do nothing`;

    await sql`delete from public.ventures where title = 'Lab booking for CS students'`;
    const [venture] = await sql`
      insert into public.ventures (type, owner_id, university_id, title, description, status, skill_ids, team_size)
      values ('project', ${owner.id}, ${university_id}, 'Lab booking for CS students',
              'Students book lab machines and see what is free right now. Built with the CS department; used by second-year students.',
              'recruiting', array['react', 'postgresql', 'nodejs'], 6)
      returning id`;
    await sql`insert into public.venture_members (venture_id, user_id, team_role) values (${venture.id}, ${owner.id}, 'lead') on conflict do nothing`;
    const roles: ["developer" | "designer" | "researcher", number][] = [["developer", 0], ["designer", 1], ["developer", 2]];
    for (const [role, i] of roles) {
      await sql`insert into public.venture_members (venture_id, user_id, team_role) values (${venture.id}, ${members[i].id}, ${role}) on conflict do nothing`;
    }
    await sql`insert into public.venture_roles (venture_id, title, skill_ids, slots, filled) values
      (${venture.id}, 'Backend developer', array['postgresql', 'nodejs'], 1, 0),
      (${venture.id}, 'QA and testing', array['playwright'], 1, 0)`;

    // A verified company with two live posts and a contact request for the viewer.
    await sql`delete from public.organizations where slug = 'indus-softworks-sample'`;
    const [org] = await sql`
      insert into public.organizations (slug, name, domain, website, industry, size, city, signer_role, status, verified_at)
      values ('indus-softworks-sample', 'Indus Softworks', 'indus-softworks-sample.pk', 'https://indus-softworks-sample.pk', 'Software', '51-200',
              'Islamabad', 'Head of Talent', 'verified', now())
      returning id`;
    await sql`insert into public.job_posts (org_id, title, type, location, remote, salary_min, salary_max, deadline, description, status, published_at) values
      (${org.id}, 'Frontend intern (React)', 'internship', 'Islamabad', false, 40000, 60000, current_date + 21,
       'Work with our web team on a customer dashboard. You will ship small features every week with a mentor.', 'live', now()),
      (${org.id}, 'Junior backend engineer', 'full_time', null, true, 120000, 160000, current_date + 30,
       'Build and run Postgres-backed APIs for our logistics product. We review code together and deploy daily.', 'live', now() - interval '1 day')`;
    const [request] = await sql`insert into public.contact_requests (org_id, student_id, role_title, message, expires_at) values
      (${org.id}, ${viewer.id}, 'Frontend intern (React)',
       'We saw your verified React work on the lab booking venture and would like to talk about our summer internship.', now() + interval '14 days') returning id`;

    const shots: Record<string, unknown> = {};
    const desktop = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" })).newPage();
    await signInWithPassword(desktop, viewer.email, viewer.password);
    await desktop.goto(`/ventures/${venture.id}`);
    await expect(desktop.getByText("Backend developer").first()).toBeVisible();
    await hideChrome(desktop);
    await desktop.evaluate(() => window.scrollTo(0, 0));
    const fromEl = (await desktop.getByRole("heading", { level: 1, name: "Lab booking for CS students" }).boundingBox())!;
    const toEl = (await desktop.getByText("QA and testing").first().boundingBox())!;
    const mainBox = (await desktop.locator("main").first().boundingBox())!;
    shots.venture = await shootClip(desktop, "venture", {
      x: mainBox.x,
      y: fromEl.y - 64,
      width: mainBox.width,
      height: Math.min(toEl.y + 80 - (fromEl.y - 64), 760),
    });

    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" })).newPage();
    await signInWithPassword(phone, viewer.email, viewer.password);
    await phone.goto("/opportunities/jobs");
    await expect(phone.getByText("Frontend intern (React)").first()).toBeVisible();
    await hideChrome(phone);
    shots.jobs = await shoot(phone, "jobs", phone.locator("main").first(), 640);
    await phone.goto(`/opportunities/contact-requests/${request.id}`);
    await expect(phone.getByText("Indus Softworks").first()).toBeVisible();
    await hideChrome(phone);
    shots.contactRequest = await shoot(phone, "contact-request", phone.locator("main").first(), 420);

    const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
    manifest.sections = shots;
    await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await sql.end();
  }
});
