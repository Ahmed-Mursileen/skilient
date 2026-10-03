import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole } from "./support";

/**
 * Phase 12 slice 1 (PRD 5.1, docs/marketing-design-plan.md): the marketing frame, the hero and
 * its university email field, the request flow, /join without JavaScript, the hero's fit on
 * desktop and phone, and axe in both themes.
 */
const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function axeBothThemes(page: Page, label: string) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("html")).toHaveClass(new RegExp(scheme));
    const results = await new AxeBuilder({ page }).withTags(RULES).analyze();
    expect(results.violations.map((v) => `${label} (${scheme}) ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
}

test.describe("Marketing: hero", () => {
  test("fits the first screen at 1280×720 and 390×844, headline in two lines on desktop", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "sizes are set explicitly");
    for (const [width, height] of [
      [1280, 720],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      const field = page.getByTestId("hero-email");
      const join = page.locator("#join").getByRole("button", { name: "Join", exact: true });
      await expect(field).toBeVisible();
      for (const el of [field, join]) {
        const box = (await el.boundingBox())!;
        expect(box.y + box.height, `${width}x${height}`).toBeLessThanOrEqual(height);
      }
      if (width === 1280) {
        const lines = await page.locator("#hero-title").evaluate((h) => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
        expect(lines).toBe(2);
        // The phone ends at the hero's bottom edge, inside the first screen.
        const phone = (await page.getByTestId("hero-capture").boundingBox())!;
        expect(phone.y + phone.height).toBeLessThanOrEqual(height);
      }
    }
  });

  test("axe in both themes, on desktop and phone", async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto("/");
    await expect(page.locator("#hero-title")).toBeVisible();
    await axeBothThemes(page, "landing");
    expect(problems).toEqual([]);
  });

  test("the focal sequence plays once and ends with post A moved up; reduced motion only crossfades", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "one browser is enough");
    const order = (page: Page) =>
      page.locator(".hero-feed > .hero-card").evaluateAll((cards) =>
        cards.map((c) => ({ a: c.classList.contains("hero-card-a"), order: Number(getComputedStyle(c).order) })).sort((x, y) => x.order - y.order).map((c) => (c.a ? "A" : "B")),
      );
    const motion = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await motion.goto("/");
    await expect(motion.locator(".hero-screen")).toHaveAttribute("data-state", "done", { timeout: 5000 });
    expect(await order(motion)).toEqual(["A", "B"]);

    const still = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" })).newPage();
    await still.goto("/");
    await expect(still.locator(".hero-screen")).toHaveAttribute("data-state", "answered", { timeout: 5000 });
    await still.waitForTimeout(1500);
    // Nothing moves under reduced motion: B stays above A.
    expect(await order(still)).toEqual(["B", "A"]);
  });
});

test.describe("Marketing: landing sections", () => {
  const SECTIONS = [
    "Anyone can write \u201cReact\u201d on a CV.",
    "How it works",
    "Posts go viral because they provide value, not entertainment.",
    "Build in teams of up to six.",
    "Skills you\u2019ve proven, not skills you\u2019ve typed.",
    "A CV anyone can check.",
    "Opportunities come to you.",
    "Our rules",
    "For organisations",
    "Free is enough to prove yourself.",
    "Questions",
    "Prove it. Don\u2019t claim it.",
  ];

  test("every section is there, in order, with JavaScript off", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "one browser is enough");
    const page = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
    await page.goto("/");
    const headings = await page.locator("main h2").allTextContents();
    const order = SECTIONS.map((h) => headings.indexOf(h));
    expect(order.every((i) => i >= 0), JSON.stringify(headings)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const h of SECTIONS) await expect(page.getByRole("main").getByRole("heading", { level: 2, name: h, exact: true })).toBeVisible();
    // The FAQ works without JavaScript too.
    await page.getByText("What happens when I graduate?").click();
    await expect(page.getByText("Your account becomes a graduate account.")).toBeVisible();
  });

  test("tier ladder shows filled under reduced motion; FAQ and the how-it-works rail work from the keyboard", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "one browser is enough");
    const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
    await page.goto("/");
    const ladder = page.getByTestId("tier-ladder");
    await ladder.scrollIntoViewIfNeeded();
    const scale = await ladder.locator(".tier-fill").evaluate((el) => getComputedStyle(el).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(scale);
    // Without scroll-driven animation support the ladder is filled as well.
    await page.addStyleTag({ content: ".tier-fill { animation: none !important; }" });
    expect(await ladder.locator(".tier-fill").evaluate((el) => getComputedStyle(el).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);

    const summary = page.locator("summary", { hasText: "How do recruiters contact me?" });
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Through a contact request that names the company and the role.")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const rail = page.getByTestId("how-rail");
    await rail.focus();
    const before = await rail.evaluate((el) => el.scrollLeft);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  });

  test("the pricing teaser reads Student Pro from plans", async ({ page }, info) => {
    test.skip(!hasBackend || info.project.name !== "desktop", "needs the local Supabase stack");
    const { data } = await adminClient().from("plans").select("price_pkr").eq("id", "student_pro_monthly").single();
    await page.goto("/");
    await expect(page.getByTestId("pricing-teaser")).toContainText(`PKR ${Number(data!.price_pkr).toLocaleString("en-PK")}`);
  });
});

test.describe("Marketing: without JavaScript", () => {
  test("content shows its end state and the email field posts to /join", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "one browser is enough");
    const page = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
    await page.goto("/");
    await expect(page.locator("#hero-title")).toBeVisible();
    await expect(page.locator(".hero-a-before")).toBeHidden();
    await expect(page.locator(".hero-a-after").first()).toBeVisible();
    // Nothing on the page is hidden waiting for a script.
    const hidden = await page.locator("main *").evaluateAll((els) =>
      els.filter((e) => e.checkVisibility() && getComputedStyle(e).opacity === "0" && !e.closest(".hero-tap")).map((e) => e.className),
    );
    expect(hidden).toEqual([]);

    await page.getByTestId("hero-email").fill("ali@gmail.com");
    await page.locator("#join").getByRole("button", { name: "Join", exact: true }).click();
    await expect(page).toHaveURL(/\/\?email=ali%40gmail\.com&state=personal#join/);
    await expect(page.getByTestId("hero-status")).toContainText("Use your university email.");

    await page.getByTestId("hero-email").fill("someone@nutech.edu.pk");
    await page.locator("#join").getByRole("button", { name: "Join", exact: true }).click();
    await expect(page).toHaveURL(/\/signup\?email=someone%40nutech\.edu\.pk/);
    await expect(page.getByLabel("University email")).toHaveValue("someone@nutech.edu.pk");

    await page.goto("/");
    await page.getByTestId("hero-email").fill("me@no-such-uni-e2e.edu.pk");
    await page.locator("#join").getByRole("button", { name: "Join", exact: true }).click();
    await expect(page).toHaveURL(/\/request-university\?email=/);
    await expect(page.getByRole("heading", { level: 1, name: "Request your university" })).toBeVisible();
  });

  test("the phone menu opens without JavaScript", async ({ browser }, info) => {
    test.skip(info.project.name !== "phone", "the menu is for small screens");
    const page = await (await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })).newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator("#site-menu").getByRole("link", { name: "Verify a CV" })).toBeVisible();
  });
});

test.describe("Marketing: university email detection and requests", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  // Every request from the test runner shares one network's limit: run these one at a time, each from a clean count.
  test.describe.configure({ mode: "serial" });
  async function resetRequestLimit() {
    const sql = postgres(DB_URL, { max: 1, onnotice: () => undefined });
    await sql`delete from private.rate_limit_events where key like 'uni_request:%'`;
    await sql.end();
  }

  test("live, personal, unknown and not-live domains; a request is sent once", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
    const problems = watchConsole(page);
    await resetRequestLimit();
    // A university that isn't live yet.
    const tag = randomBytes(4).toString("hex");
    const db = adminClient();
    const { data: uni, error } = await db
      .from("universities")
      .insert({ name: `Closed Test University ${tag}`, slug: `closed-test-${tag}`, city: "Quetta", live_at: null })
      .select("id")
      .single();
    expect(error).toBeNull();
    await db.from("university_domains").insert({ university_id: uni!.id, domain: `closed-${tag}.edu.pk`, kind: "both" });

    await page.goto("/");
    const field = page.getByTestId("hero-email");
    const status = page.getByTestId("hero-status");
    await field.fill("hira@nutech.edu.pk");
    await expect(status).toContainText("is on Skilient.");
    await field.fill("hira@gmail.com");
    await expect(status).toContainText("Use your university email.");
    await field.fill("hira@unknown-e2e.edu.pk");
    await expect(status).toContainText("We don't recognise this university.");
    await field.fill(`hira.${tag}@closed-${tag}.edu.pk`);
    await expect(status).toContainText(`Closed Test University ${tag} isn't on Skilient yet.`);

    // Join on a not-live domain opens the request sheet with the university named.
    await page.locator("#join").getByRole("button", { name: "Join", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Request your university" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(`Requesting Closed Test University ${tag}.`);
    await expect(sheet.getByLabel("University email")).toHaveValue(`hira.${tag}@closed-${tag}.edu.pk`);
    await sheet.getByRole("button", { name: "Send request" }).click();
    await expect(sheet.getByText("Tick the box so we can email you when your university joins.")).toBeVisible();
    await sheet.getByLabel("Email me when my university joins.").check();
    await sheet.getByRole("button", { name: "Send request" }).click();
    await expect(sheet.getByTestId("request-done")).toContainText("Request sent.");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // Asking again changes nothing.
    await page.goto(`/request-university?email=hira.${tag}%40closed-${tag}.edu.pk`);
    await page.getByLabel("Email me when my university joins.").check();
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByTestId("request-done")).toContainText(`You've already asked for Closed Test University ${tag}.`);

    const { count } = await db.from("university_requests").select("id", { count: "exact", head: true }).eq("domain", `closed-${tag}.edu.pk`);
    expect(count).toBe(1);
    await axeBothThemes(page, "request-university");

    // Live domains go straight to signup with the email filled in.
    await page.goto("/");
    await page.getByTestId("hero-email").fill("zara@nutech.edu.pk");
    await expect(page.getByTestId("hero-status")).toContainText("is on Skilient.");
    await page.locator("#join").getByRole("button", { name: "Join", exact: true }).click();
    await expect(page).toHaveURL(/\/signup\?email=zara%40nutech\.edu\.pk/);
    await expect(page.getByLabel("University email")).toHaveValue("zara@nutech.edu.pk");
    expect(problems).toEqual([]);
  });

  test("requests are limited to 5 an hour per network; bad email links say so", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
    await resetRequestLimit();
    const tag = randomBytes(4).toString("hex");
    let limited = false;
    for (let i = 0; i < 6; i++) {
      await page.goto(`/request-university?email=r${i}.${tag}%40rate-${tag}.edu.pk`);
      await page.getByLabel("University name").fill(`Rate Test Institute ${tag}`);
      await page.getByLabel("Email me when my university joins.").check();
      await page.getByRole("button", { name: "Send request" }).click();
      const done = page.getByTestId("request-done");
      const refused = page.getByText("Too many requests from this network. Try again in an hour.");
      await expect(done.or(refused)).toBeVisible();
      if (await refused.isVisible()) {
        limited = true;
        expect(i).toBe(5);
      }
    }
    expect(limited).toBe(true);

    await page.goto(`/request-university/confirm?token=${"x".repeat(40)}`);
    await expect(page.getByText("That link has expired or was already used.")).toBeVisible();
    await page.goto(`/request-university/unsubscribe?token=${"x".repeat(40)}`);
    await page.getByRole("button", { name: "Stop emails" }).click();
    await expect(page.getByText("That link has expired or was already used.")).toBeVisible();
  });

  test("signed-in visitors see Open Skilient instead of the field", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Maham Open" });
    await signInWithPassword(page, student.email, student.password);
    await page.goto("/");
    await expect(page.getByTestId("hero-open")).toHaveAttribute("href", "/feed");
    await expect(page.getByTestId("nav-open")).toBeVisible();
    await expect(page.getByTestId("hero-email")).toHaveCount(0);
  });
});
