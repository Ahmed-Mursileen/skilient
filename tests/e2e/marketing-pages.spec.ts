import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { createStudent, hasBackend, signInWithPassword, watchConsole } from "./support";

/**
 * Phase 12 slice 3 (PRD 5.1, 4a; docs/marketing-design-plan.md B7): /recruiters, /universities,
 * /faculty, /pricing and /about, each with axe in both themes; their CTAs signed out and in;
 * pricing equal to `plans` with the monthly/yearly toggle working without JavaScript; and the
 * "Talk to us" form, sent once and limited to 5 an hour per network.
 */
const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function axeBothThemes(page: Page, label: string) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await expect(page.locator("html")).toHaveClass(new RegExp(scheme));
    const results = await new AxeBuilder({ page }).withTags(RULES).analyze();
    expect(results.violations.map((v) => `${label} (${scheme}) ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
}

const PAGES = [
  { path: "/recruiters", h1: "Hire on evidence you can check.", cta: "/signup/recruiter" },
  { path: "/universities", h1: "Your campus, with proof of what students can do.", cta: "#talk" },
  { path: "/faculty", h1: "Your judgement, on the record.", cta: "/signup?role=faculty" },
  { path: "/pricing", h1: "Proof is free. Polish is optional.", cta: null },
  { path: "/about", h1: "A CV should show the work behind it.", cta: null },
] as const;

test.describe("Marketing: organisation pages, pricing and about", () => {
  for (const p of PAGES) {
    test(`${p.path}: heading, call to action and axe in both themes`, async ({ page }) => {
      const problems = watchConsole(page);
      await page.goto(p.path);
      await expect(page.getByRole("heading", { level: 1, name: p.h1 })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      if (p.cta) await expect(page.getByTestId("org-cta").first()).toHaveAttribute("href", p.cta);
      await axeBothThemes(page, p.path);
      expect(problems).toEqual([]);
    });
  }

  test("/about names the team and the incubator", async ({ page }) => {
    await page.goto("/about");
    const team = page.getByTestId("about-team");
    for (const name of ["Huzaifa Khan", "Ahmed Mursileen", "Laiba Owais"]) {
      await expect(team.getByRole("img", { name })).toBeVisible();
      await expect(team.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("about-incubation")).toContainText("NUTECH Entrepreneurial and Incubation Center");
  });

  test("the nav and footer link to every built page", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "the desktop nav shows every link");
    await page.goto("/");
    const main = page.getByRole("navigation", { name: "Main" });
    for (const [label, href] of [
      ["For recruiters", "/recruiters"],
      ["For universities", "/universities"],
      ["For faculty", "/faculty"],
      ["Pricing", "/pricing"],
    ]) {
      await expect(main.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    }
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "About", exact: true })).toHaveAttribute("href", "/about");
  });
});

test.describe("Marketing: pricing", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");

  test("every price equals plans, and monthly/yearly switches without JavaScript", async ({ browser }) => {
    const sql = postgres(DB_URL, { max: 1, onnotice: () => undefined });
    const plans = await sql<{ id: string; tier: string; interval: string; price_pkr: number | null }[]>`
      select id, tier, interval, price_pkr from public.plans where active order by audience, position`;
    const fees = await sql<{ value: { intern: number } }[]>`select value from public.platform_config where key = 'billing.hire_fees'`;
    await sql.end();
    const pkr = (n: number) => `PKR ${n.toLocaleString("en-PK")}`;
    const price = (id: string) => Number(plans.find((p) => p.id === id)!.price_pkr);

    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/pricing");
    const recruiters = page.getByTestId("plans-recruiters");
    const starter = recruiters.getByTestId("plan-recruiters-starter");
    await expect(starter.getByText(pkr(price("recruiter_starter_monthly")), { exact: true })).toBeVisible();
    await expect(starter.getByText(pkr(price("recruiter_starter_yearly")), { exact: true })).toBeHidden();
    await recruiters.getByRole("radio", { name: "Yearly" }).check();
    await expect(starter.getByText(pkr(price("recruiter_starter_yearly")), { exact: true })).toBeVisible();
    await expect(starter.getByText(pkr(price("recruiter_starter_monthly")), { exact: true })).toBeHidden();
    // Enterprise has no list price; universities are yearly only, so there is no toggle.
    await expect(recruiters.getByTestId("plan-recruiters-enterprise").getByText("Custom", { exact: true })).toBeVisible();
    const unis = page.getByTestId("plans-universities");
    await expect(unis.getByRole("radio")).toHaveCount(0);
    await expect(unis.getByTestId("plan-universities-campus").getByText(pkr(price("uni_campus_yearly")), { exact: true })).toBeVisible();
    // Student Pro and the add-ons, from plans and platform_config.
    await expect(page.getByTestId("plan-students-pro").getByText(pkr(price("student_pro_monthly")), { exact: true })).toBeVisible();
    await expect(page.getByTestId("pricing-add-ons")).toContainText(pkr(fees[0]!.value.intern));
    await context.close();
  });
});

test.describe("Marketing: Talk to us", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  // Every message from the test runner shares one network's limit: one test at a time, from a clean count.
  test.describe.configure({ mode: "serial" });
  async function sql<T>(fn: (db: postgres.Sql) => Promise<T>): Promise<T> {
    const db = postgres(DB_URL, { max: 1, onnotice: () => undefined });
    try {
      return await fn(db);
    } finally {
      await db.end();
    }
  }
  const resetLimit = () => sql((db) => db`delete from private.rate_limit_events where key like 'sales_lead:%'`);

  async function send(page: Page, email: string) {
    // A full load each time (a hash-only change would keep the sent state).
    await page.goto("/universities");
    await page.getByLabel("Your name").fill("Dr Amna Rauf");
    await page.getByLabel("Your role").fill("Director, Career Services");
    await page.getByLabel("University", { exact: true }).fill("Leads Test University");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("What would you like to do with Skilient?").fill("We would like a demo of the dashboards for our career office.");
    await page.getByRole("button", { name: "Send" }).click();
  }

  test("a message becomes one lead, and sending again reads as sent", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
    await resetLimit();
    const email = `amna.${randomBytes(4).toString("hex")}@nutech.edu.pk`;
    await page.goto("/universities#talk");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await send(page, email);
    await expect(page.getByTestId("talk-done")).toBeVisible();
    await send(page, email);
    await expect(page.getByTestId("talk-done")).toBeVisible();
    const rows = await sql((db) => db<{ status: string; university: string | null }[]>`
      select l.status::text, u.name as university from public.sales_leads l left join public.universities u on u.id = l.university_id where l.email = ${email}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "new" });
    expect(rows[0]!.university).toMatch(/National University of Technology/);
  });

  test("messages are limited to 5 an hour per network", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
    await resetLimit();
    const tag = randomBytes(4).toString("hex");
    let limited = false;
    for (let i = 0; i < 6; i++) {
      await send(page, `lead${i}.${tag}@leads-${tag}.edu.pk`);
      const done = page.getByTestId("talk-done");
      const refused = page.getByText("Too many messages from this network. Try again in an hour.");
      await expect(done.or(refused)).toBeVisible();
      if (await refused.isVisible()) {
        limited = true;
        expect(i).toBe(5);
      }
    }
    expect(limited).toBe(true);
  });

  test("signed-in visitors get Open Skilient on the organisation pages", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Maham Pages" });
    await signInWithPassword(page, student.email, student.password);
    for (const path of ["/recruiters", "/faculty"]) {
      await page.goto(path);
      await expect(page.getByTestId("org-cta").first()).toHaveText(/Open Skilient/);
      await expect(page.getByTestId("org-cta").first()).toHaveAttribute("href", "/feed");
    }
  });
});

test.describe("Marketing: search, sharing and legal pages", () => {
  test("robots, the sitemap, canonicals, Open Graph cards and structured data", async ({ page, request }, info) => {
    test.skip(info.project.name !== "desktop", "one browser is enough");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /feed");
    expect(robots).toContain("Disallow: /ops");
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const path of ["/recruiters", "/universities", "/faculty", "/pricing", "/about", "/verify"]) expect(sitemap).toContain(`${path}</loc>`);
    expect(sitemap).not.toContain("/privacy</loc>");

    await page.goto("/recruiters");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/recruiters$/);
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toMatch(/\/recruiters\/opengraph-image/);
    const card = await request.get(new URL(og!).pathname + new URL(og!).search);
    expect(card.status()).toBe(200);
    expect(card.headers()["content-type"]).toBe("image/png");
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(ld).toMatchObject({ "@type": "Organization", name: "Skilient" });
    await page.goto("/");
    const homeCard = new URL((await page.locator('meta[property="og:image"]').getAttribute("content"))!);
    expect((await request.get(homeCard.pathname + homeCard.search)).status()).toBe(200);
  });

  test("/demo is not a page", async ({ request }) => {
    expect((await request.get("/demo")).status()).toBe(404);
  });

  test("/terms shows the agreement, /privacy its headings; both stay out of search", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await axeBothThemes(page, "/terms");
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
    await expect(page.getByTestId("privacy-headings").getByRole("listitem")).toHaveCount(8);
    await axeBothThemes(page, "/privacy");
  });

  test("/verify sits in the marketing frame and code pages are noindex", async ({ page }) => {
    await page.goto("/verify");
    await expect(page.getByRole("heading", { level: 1, name: "Check a verified CV" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await axeBothThemes(page, "/verify");
    await page.goto("/verify/ABCDE12345");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("signed-in pages are noindex", async ({ page }, info) => {
    test.skip(!hasBackend || info.project.name !== "desktop", "needs the local Supabase stack; once is enough");
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Nida Noindex" });
    await signInWithPassword(page, student.email, student.password);
    await page.goto("/feed");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
