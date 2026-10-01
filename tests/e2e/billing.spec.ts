import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, PASSWORD, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 10 (PRD 4a, 4b, 5.24): the simulated gateway end to end. A student starts the free trial, then pays for
 * Student Pro on the simulated checkout ("Payment will be done on this screen", test mode); the result travels
 * as a signed webhook through /api/billing/webhook/simulated, the database applies it and the return page
 * (which never trusts the redirect) shows it confirmed. A failed payment changes nothing. An organisation buys
 * Starter and credits; Explore's refusal opens the upgrade sheet. Staff see the billing tools and gateway
 * readiness, a university owner sees the licence page. Every new screen is checked with axe in both themes.
 */
test.describe("Billing", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

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

  async function withTwoFactor(browser: Browser, who: { email: string; password: string }): Promise<Page> {
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

  async function createAccount(email: string, meta: Record<string, unknown>): Promise<TestStudent> {
    const db = adminClient();
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    await db.from("agreement_acceptances").insert({ user_id: data.user.id, version: 1 });
    return { id: data.user.id, email, password: PASSWORD, fullName: String(meta.full_name ?? ""), username: "" };
  }

  test("a student tries Pro, pays on the simulated checkout and gets a receipt", async ({ page }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Bilal Billing" });
    await signInWithPassword(page, student.email, student.password);

    await page.goto("/settings/billing");
    await expect(page.getByRole("heading", { level: 1, name: "Billing" })).toBeVisible();
    await expect(page.getByTestId("plan-name")).toHaveText("Free");
    await expect(page.getByTestId("test-mode-banner")).toBeVisible();
    await axeBothThemes(page, "student billing");

    await page.getByTestId("trial-form").getByRole("button", { name: "Start my free trial" }).click();
    await expect(page.getByTestId("plan-status")).toHaveText("Free trial");
    await expect(page.getByTestId("ent-cv.pdf_export")).toHaveText("Yes");

    await page.getByTestId("checkout-student_pro_monthly").click();
    await page.waitForURL(/\/billing\/checkout\//);
    await expect(page.getByRole("heading", { level: 1, name: "Payment will be done on this screen" })).toBeVisible();
    await expect(page.getByTestId("test-mode-notice")).toHaveText("Test mode: no real money is charged.");
    await expect(page.getByTestId("checkout-amount")).toHaveText("PKR 399");
    await axeBothThemes(page, "simulated checkout");

    await page.getByTestId("sim-pay-card").click();
    await page.waitForURL(/\/billing\/return\//);
    await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "paid", { timeout: 60_000 });
    await axeBothThemes(page, "return page");

    await page.goto("/settings/billing");
    await expect(page.getByTestId("plan-name")).toHaveText("Student Pro (monthly)");
    await expect(page.getByTestId("plan-status")).toHaveText("Active");
    await expect(page.getByTestId("invoice-table")).toContainText(/TEST-\d{4}-\d{6}/);
    await expect(page.getByTestId("payment-table")).toContainText("PKR 399 (test)");
    const href = await page.getByTestId("invoice-table").getByRole("link").first().getAttribute("href");
    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    const db = adminClient();
    const { data: sub } = await db.from("subscriptions").select("status, live, payment_method").eq("subject_id", student.id).eq("status", "active").single();
    expect(sub).toMatchObject({ status: "active", live: false, payment_method: "card" });
    expect(problems).toEqual([]);
  });

  test("a failed simulated payment charges nothing", async ({ page }) => {
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Farah Failed" });
    await signInWithPassword(page, student.email, student.password);
    await page.goto("/settings/billing");
    await page.getByTestId("checkout-student_pro_yearly").click();
    await page.waitForURL(/\/billing\/checkout\//);
    await expect(page.getByTestId("checkout-amount")).toHaveText("PKR 3,499");
    await page.getByTestId("sim-pay-fail").click();
    await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "failed", { timeout: 60_000 });
    const { count } = await adminClient().from("payments").select("id", { count: "exact", head: true }).eq("subject_id", student.id);
    expect(count).toBe(0);
  });

  test("an organisation on Explore meets the upgrade sheet, then buys Starter and credits", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = adminClient();
    const domain = `bill-${Math.random().toString(36).slice(2, 8)}.example.com`;
    const admin = await createAccount(`ada@${domain}`, { role: "recruiter", full_name: "Ada Admin" });
    const { data: org, error } = await db
      .from("organizations")
      .insert({ slug: domain.split(".")[0], name: "Bill Co", domain, website: `https://${domain}`, industry: "Software", size: "1-10", city: "Lahore", signer_role: "CEO", status: "verified", created_by: admin.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await db.from("org_members").insert({ org_id: org!.id, user_id: admin.id, role: "admin" });
    const rp = await withTwoFactor(browser, admin);

    // Explore: shortlists aren't included, and the refusal opens the upgrade sheet.
    await rp.goto("/recruit/shortlists");
    await rp.getByTestId("shortlist-name").fill("Frontend");
    await rp.getByTestId("shortlist-create").click();
    const sheet = rp.getByTestId("upgrade-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Shortlists and private notes: not included in your plan");
    await sheet.getByRole("link", { name: "See plans" }).click();
    await rp.waitForURL(/\/org\/billing$/);

    await expect(rp.getByTestId("plan-name")).toHaveText("Explore (free)");
    await expect(rp.getByTestId("province-needed")).toBeVisible();
    await axeBothThemes(rp, "org billing");
    await rp.getByTestId("billing-details-form").getByRole("button", { name: "Save details" }).click();
    await expect(rp.getByTestId("province-needed")).toHaveCount(0);

    await rp.getByTestId("checkout-recruiter_starter_monthly").click();
    await rp.waitForURL(/\/billing\/checkout\//);
    await expect(rp.getByTestId("checkout-amount")).toHaveText("PKR 15,000");
    await rp.getByTestId("sim-pay-card").click();
    await expect(rp.getByTestId("checkout-result")).toHaveAttribute("data-status", "paid", { timeout: 60_000 });

    await rp.goto("/org/billing");
    await expect(rp.getByTestId("plan-name")).toHaveText("Starter (monthly)");
    await expect(rp.getByTestId("ent-recruit.shortlists")).toHaveText("Yes");
    await rp.getByTestId("credits-qty").fill("5");
    await rp.getByTestId("buy-credits").click();
    await rp.waitForURL(/\/billing\/checkout\//);
    await rp.getByTestId("sim-pay-wallet").click();
    await expect(rp.getByTestId("checkout-result")).toHaveAttribute("data-status", "paid", { timeout: 60_000 });
    await rp.goto("/org/billing");
    await expect(rp.getByTestId("ent-contact.credits")).toHaveText("30 left of 30");
    await expect(rp.getByTestId("invoice-table")).toContainText("Invoice");
  });

  test("staff see accounts, revenue and gateway readiness; a university owner sees the licence page", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = adminClient();
    const staff = await createStudent({ domain: "nutech.edu.pk", fullName: "Sana Staff" });
    await db.from("staff_roles").insert({ user_id: staff.id, role: "accounts" });
    const sp = await withTwoFactor(browser, staff);
    await sp.goto("/ops/billing?q=Bilal");
    await expect(sp.getByRole("heading", { level: 1, name: "Billing" })).toBeVisible();
    await axeBothThemes(sp, "ops billing accounts");
    await sp.goto("/ops/billing?tab=revenue");
    await expect(sp.getByTestId("revenue-cards")).toContainText("MRR");
    await axeBothThemes(sp, "ops billing revenue");
    await sp.goto("/ops/billing?tab=gateways");
    const ready = sp.getByTestId("gateway-readiness");
    await expect(ready).toContainText("simulated");
    await expect(ready).toContainText("SAFEPAY_API_KEY");
    await axeBothThemes(sp, "ops billing gateways");
    await sp.goto(`/ops/billing/user/${staff.id}`);
    await expect(sp.getByRole("heading", { level: 1, name: "Sana Staff" })).toBeVisible();
    await axeBothThemes(sp, "ops billing account");

    // A university owner (claimed earlier by staff) on the free level.
    // An unclaimed university with one domain for students and staff, from the end of the list (uni.spec takes the start).
    const { data: rows } = await db
      .from("university_domains")
      .select("university_id, domain, universities!inner(owner_id, university_admins(user_id))")
      .eq("kind", "both")
      .is("universities.owner_id", null)
      .order("domain", { ascending: false })
      .limit(80);
    const counts = new Map<string, number>();
    for (const r of rows ?? []) counts.set(r.university_id, (counts.get(r.university_id) ?? 0) + 1);
    const free = (r: { universities: unknown }) => ((r.universities as { university_admins?: unknown[] }).university_admins ?? []).length === 0;
    const pick = (rows ?? []).find((r) => counts.get(r.university_id) === 1 && free(r) && !["nutech.edu.pk", "nu.edu.pk"].includes(r.domain))!;
    const uni = { id: pick.university_id as string };
    const dom = { domain: pick.domain as string };
    const owner = await createAccount(`owner-${Math.random().toString(36).slice(2, 8)}@${dom.domain}`, { role: "university_admin", full_name: "Omar Owner", university_id: uni.id });
    const { error: adminError } = await db.from("university_admins").insert({ user_id: owner.id, university_id: uni.id, role: "owner" });
    if (adminError) throw new Error(`university_admins: ${adminError.message}`);
    await db.from("universities").update({ owner_id: owner.id, claimed_at: new Date().toISOString() }).eq("id", uni.id);
    const op = await withTwoFactor(browser, owner);
    await op.goto("/uni/billing");
    await expect(op.getByTestId("plan-name")).toHaveText("Free (every university)");
    await axeBothThemes(op, "uni billing");
    await op.getByTestId("licence-request-form").getByLabel("Note (PO number, start date, contact)").fill("PO 2026-17, from January");
    await op.getByTestId("licence-request-form").getByRole("button", { name: "Send request" }).click();
    await expect(op.getByText("Sent. The Skilient team will issue the invoice")).toBeVisible();
    await db.from("universities").update({ owner_id: null, claimed_at: null }).eq("id", uni.id);
    await db.from("university_admins").delete().eq("user_id", owner.id);
  });
});
