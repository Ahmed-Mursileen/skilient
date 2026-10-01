import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, hasBackend, PASSWORD, signInWithPassword, totp, type TestStudent } from "./support";

/**
 * Phase 9 (PRD 5.23): a university official signs up, turns on two-factor and claims an unclaimed
 * university with a letter; Skilient accounts staff approve it; the owner runs the portal (a colour
 * failing contrast is refused, departments, an announcement, an event); on Growth (a test plan set
 * by SQL) a record view is logged; a student RSVPs and opens the ecosphere. Every new screen is
 * checked with axe in both themes.
 */
test.describe("University portal", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });
  test.describe.configure({ mode: "serial", timeout: 240_000 });

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

  async function withTwoFactor(browser: Browser, who: TestStudent): Promise<Page> {
    const page = await (await browser.newContext()).newPage();
    await signInWithPassword(page, who.email, who.password);
    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Set up two-factor" }).click();
    const secret = (await page.locator("code").first().textContent())?.trim() ?? "";
    await page.getByLabel("Code from the app").fill(totp(secret));
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("checkbox", { name: "I've saved these codes" }).check();
    await page.getByRole("button", { name: "Done" }).click();
    return page;
  }

  async function account(email: string, fullName: string, meta: Record<string, unknown>): Promise<TestStudent> {
    const db = adminClient();
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName, ...meta } });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    await db.from("agreement_acceptances").insert({ user_id: data.user.id, version: 1 });
    return { id: data.user.id, email, password: PASSWORD, fullName, username: "" };
  }

  const tag = Math.random().toString(36).slice(2, 8);
  let uni = { id: "", domain: "", slug: "" };
  let owner: TestStudent;
  let student: TestStudent;
  let ownerPage: Page;

  test.beforeAll(async () => {
    test.skip(!hasBackend);
    const db = adminClient();
    // An unclaimed university with one domain that admits both students and staff.
    const { data } = await db.from("university_domains").select("university_id, domain, universities!inner(slug, owner_id)").eq("kind", "both").is("universities.owner_id", null).limit(50);
    const { data: open } = await db.from("university_claims").select("university_id").eq("status", "pending");
    const busy = new Set((open ?? []).map((c) => c.university_id));
    const row = (data ?? []).find((r) => !["nutech.edu.pk", "nu.edu.pk", "preston.edu.pk"].includes(r.domain) && !busy.has(r.university_id));
    if (!row) throw new Error("no unclaimed university");
    uni = { id: row.university_id, domain: row.domain, slug: (row.universities as unknown as { slug: string }).slug };
    owner = await account(`registrar-${tag}@${uni.domain}`, "Rida Registrar", { role: "university_admin", university_id: uni.id });
    student = await account(`stu-${tag}@${uni.domain}`, "Sami Student", { university_id: uni.id });
    await db.from("profiles").update({ username: `uni_${tag}`, department: "Computer Science", graduation_year: 2027, onboarding_complete: true }).eq("user_id", student.id);
    await db.from("tour_progress").insert({ user_id: student.id, tour_id: "student", step: 0, skipped_at: new Date().toISOString() });
  });

  test("an official claims the university and staff approve it", async ({ browser }) => {
    ownerPage = await withTwoFactor(browser, owner);
    await ownerPage.goto("/uni");
    await ownerPage.waitForURL("**/uni/claim");
    await expect(ownerPage.getByTestId("claim-form")).toBeVisible();
    await axeBothThemes(ownerPage, "claim");
    await ownerPage.getByLabel("Your job title").fill("Registrar");
    await ownerPage.getByLabel("Authorisation letter or signed MoU").setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") });
    await ownerPage.getByRole("button", { name: "Send for verification" }).click();
    await expect(ownerPage.getByTestId("claim-pending")).toBeVisible();

    const staff = await account(`staff-${tag}@nutech.edu.pk`, "Sara Staff", {});
    await adminClient().from("profiles").update({ username: `staff_${tag}`, department: "Computer Science", graduation_year: 2027, onboarding_complete: true }).eq("user_id", staff.id);
    await adminClient().from("tour_progress").insert({ user_id: staff.id, tour_id: "student", step: 0, skipped_at: new Date().toISOString() });
    await adminClient().from("staff_roles").insert({ user_id: staff.id, role: "accounts" });
    const staffPage = await withTwoFactor(browser, staff);
    await staffPage.goto("/ops/universities");
    await axeBothThemes(staffPage, "ops universities");
    await staffPage.getByTestId("ops-claims").getByRole("link").filter({ hasText: /./ }).last().click();
    await staffPage.getByLabel("Approve: make them the owner").check();
    await staffPage.getByLabel("Reason (the requester reads it)").fill("Letter matches the registrar's page");
    await staffPage.getByRole("button", { name: "Record decision" }).click();
    await staffPage.waitForURL("**/ops/universities");
    const { data } = await adminClient().from("universities").select("owner_id").eq("id", uni.id).single();
    expect(data?.owner_id).toBe(owner.id);
  });

  test("the owner runs the portal; a colour failing contrast is refused", async () => {
    await ownerPage.goto("/uni");
    await expect(ownerPage.getByTestId("uni-plan")).toHaveText("Free");
    await axeBothThemes(ownerPage, "uni home");

    await ownerPage.goto("/uni/settings/branding");
    await axeBothThemes(ownerPage, "branding");
    const form = ownerPage.getByTestId("branding-form");
    await form.getByLabel("Light mode").first().fill("#f5f5f5");
    await form.getByRole("button", { name: "Save branding" }).click();
    await expect(form.getByRole("alert")).toContainText("4.5:1");
    await form.getByLabel("Light mode").first().fill("#1f4e79");
    await form.getByRole("button", { name: "Save branding" }).click();
    await expect(form.getByRole("status")).toHaveText("Saved.");

    await ownerPage.goto("/uni/people");
    await ownerPage.getByTestId("add-department").getByLabel("Department name").fill("Computer Science");
    await ownerPage.getByTestId("add-department").getByRole("button", { name: "Add department" }).click();
    await expect(ownerPage.getByTestId("departments")).toContainText("Computer Science");
    await axeBothThemes(ownerPage, "people");

    for (const [path, label] of [
      ["/uni/settings/ecosphere", "ecosphere"], ["/uni/settings/calendar", "calendar"], ["/uni/settings/domains", "domains"],
      ["/uni/settings/admins", "admins"], ["/uni/moderation", "moderation"], ["/uni/students", "students (locked)"],
      ["/uni/dashboard/adoption", "dashboard (locked)"], ["/uni/sponsorship", "sponsorship"], ["/uni/billing", "billing"],
    ] as const) {
      await ownerPage.goto(path);
      await axeBothThemes(ownerPage, label);
    }
    await ownerPage.goto("/uni/settings/admins");
    await expect(ownerPage.getByTestId("seats")).toContainText("1 of 1");

    await ownerPage.goto("/uni/announcements");
    await ownerPage.getByTestId("announce-form").getByLabel("Announcement").fill("Welcome week starts Monday.");
    await ownerPage.getByTestId("announce-form").getByRole("button", { name: "Post announcement" }).click();
    await expect(ownerPage.getByTestId("announcements")).toContainText("Welcome week");
    await axeBothThemes(ownerPage, "announcements");

    await ownerPage.goto("/uni/events");
    const ev = ownerPage.getByTestId("event-form");
    await ev.getByLabel("Title").fill("Career talk");
    const start = new Date(Date.now() + 3 * 86_400_000);
    const pkt = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 16);
    await ev.getByLabel("Starts").fill(pkt(start));
    await ev.getByLabel("Ends").fill(pkt(new Date(start.getTime() + 2 * 3_600_000)));
    await ev.getByLabel("Place").fill("Main hall");
    await ev.getByRole("button", { name: "Create event" }).click();
    await expect(ownerPage.getByTestId("uni-events")).toContainText("Career talk");
    await axeBothThemes(ownerPage, "events admin");
  });

  test("on Growth a record view is logged; a student RSVPs and sees the ecosphere", async ({ browser }) => {
    const db = adminClient();
    const { data: cfg } = await db.from("platform_config").select("version, value").eq("key", "uni.test_plans").order("version", { ascending: false }).limit(1);
    await db.from("platform_config").insert({ key: "uni.test_plans", version: (cfg?.[0]?.version ?? 0) + 1, value: { ...(cfg?.[0]?.value as object), [uni.id]: "growth" }, reason: "e2e" });

    await ownerPage.goto("/uni/students");
    await axeBothThemes(ownerPage, "students");
    await ownerPage.getByTestId("students").getByRole("link", { name: "Sami Student" }).click();
    await expect(ownerPage.getByTestId("student-record")).toContainText("This view was logged");
    const { count } = await db.from("student_record_access_log").select("id", { count: "exact", head: true }).eq("student_id", student.id);
    expect(count).toBeGreaterThanOrEqual(1);
    await ownerPage.goto("/uni/dashboard/adoption");
    await axeBothThemes(ownerPage, "dashboard");
    await ownerPage.goto("/uni/fairs");
    await axeBothThemes(ownerPage, "fairs");
    await ownerPage.goto("/uni/hackathons");
    await axeBothThemes(ownerPage, "hackathons");

    const page = await (await browser.newContext()).newPage();
    await signInWithPassword(page, student.email, student.password);
    await page.goto("/events");
    await expect(page.getByTestId("event-card").filter({ hasText: "Career talk" })).toBeVisible();
    await axeBothThemes(page, "events");
    await page.getByTestId("event-card").filter({ hasText: "Career talk" }).getByTestId("rsvp").click();
    await expect(page.getByTestId("event-card").filter({ hasText: "Career talk" })).toContainText("You're going");

    await page.goto(`/u/${uni.slug}`);
    await expect(page.getByTestId("ecosphere")).toBeVisible();
    await axeBothThemes(page, "ecosphere");

    await page.goto("/settings/privacy");
    await expect(page.getByTestId("record-viewers-locked")).toBeVisible();
  });
});
