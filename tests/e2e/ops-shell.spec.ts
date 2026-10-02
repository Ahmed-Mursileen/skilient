import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 11 slice 1 (PRD 5.26, screen spec 3.11): the ops shell. A super admin works the inbox,
 * grants and removes a staff role (audited, two-factor required), filters the audit log and
 * exports it; every /ops page passes axe in both themes; a moderator sees only their areas.
 */
test.describe("Ops shell", () => {
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

  /** Signed in with two-factor turned on, so the session is aal2. */
  async function twoFactorPage(browser: Browser, who: TestStudent): Promise<Page> {
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
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

  test("a super admin works the inbox, staff roles and the audit log", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = adminClient();
    const tag = Math.random().toString(36).slice(2, 8);
    const helperName = `Hamza Helper ${tag}`;
    const admin = await createStudent({ domain: "nutech.edu.pk", fullName: "Sana Superadmin" });
    const helper = await createStudent({ domain: "nutech.edu.pk", fullName: helperName });
    const noTwoFactor = await createStudent({ domain: "nutech.edu.pk", fullName: "Nadia Nofactor" });
    await db.from("staff_roles").insert({ user_id: admin.id, role: "super_admin", granted_by: admin.id });
    await db.from("feedback").insert({ user_id: noTwoFactor.id, type: "idea", body: `Inbox idea ${tag}` });

    const page = await twoFactorPage(browser, admin);
    const helperPage = await twoFactorPage(browser, helper);
    const problems = watchConsole(page);

    // Inbox: every queue, oldest first, claim in place.
    await page.goto("/ops");
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    await expect(page.getByTestId("staff-marker")).toContainText("Super admin");
    const item = page.getByTestId("inbox-item").filter({ hasText: `Inbox idea ${tag}` });
    await expect(item).toContainText("Nobody yet");
    await item.getByRole("button", { name: /^Claim Feedback/ }).click();
    await expect(item).toContainText("You");
    await page.getByTestId("inbox-queue").filter({ hasText: "Feedback" }).click();
    await expect(page).toHaveURL(/\/ops\?queue=feedback$/);
    await expect(page.getByTestId("inbox-item").and(page.locator(":not([data-queue='feedback'])"))).toHaveCount(0);
    await item.getByRole("button", { name: /^Release Feedback/ }).click();
    await expect(item).toContainText("Nobody yet");

    // Staff roles: two-factor required, reason required, audited.
    await page.getByTestId("ops-sidebar").getByRole("link", { name: "Staff" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Staff" })).toBeVisible();
    const grant = page.getByRole("form", { name: "Grant a role" });
    await grant.getByLabel("Account email").fill(noTwoFactor.email);
    await grant.getByLabel("Role").selectOption("moderator");
    await grant.getByLabel("Reason").fill("New moderator for the beta");
    await grant.getByRole("button", { name: "Grant role" }).click();
    await expect(grant.getByRole("alert")).toContainText("no two-factor");
    await grant.getByLabel("Account email").fill(helper.email);
    await grant.getByRole("button", { name: "Grant role" }).click();
    await expect(grant.getByRole("status")).toContainText("Moderator granted");
    const row = page.getByTestId("staff-row").filter({ hasText: helperName });
    await expect(row).toContainText("Moderator");
    await expect(row).toContainText("On");
    await axeBothThemes(page, "staff");

    // The moderator now sees only their areas; Staff is not one of them.
    await helperPage.goto("/ops");
    const sidebar = helperPage.getByTestId("ops-sidebar");
    await expect(sidebar.getByRole("link", { name: "Reports" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Staff" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Billing" })).toHaveCount(0);
    await helperPage.goto("/ops/staff");
    await expect(helperPage.getByText("We couldn't find that page")).toBeVisible();

    // Remove the role again, with a reason.
    await row.getByRole("button", { name: `Remove Moderator from ${helperName}` }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this role?" });
    await dialog.getByRole("button", { name: "Remove role" }).click();
    await expect(dialog).toContainText("Give a reason.");
    await dialog.getByLabel("Reason").fill("Beta cover ended");
    await dialog.getByRole("button", { name: "Remove role" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("staff-row").filter({ hasText: helperName })).toHaveCount(0);
    await helperPage.goto("/ops");
    await expect(helperPage.getByText("We couldn't find that page")).toBeVisible();
    await expect(helperPage.getByTestId("ops-sidebar")).toHaveCount(0);

    // Audit log: filter, before/after, export.
    await page.goto("/ops/audit");
    await page.getByLabel("Action").selectOption("staff.grant");
    await page.getByLabel("Target id").fill(helper.id);
    await page.getByRole("button", { name: "Filter" }).click();
    const auditRow = page.getByTestId("audit-row");
    await expect(auditRow).toHaveCount(1);
    await expect(auditRow).toContainText("New moderator for the beta");
    await auditRow.getByText("Before and after").click();
    await expect(auditRow.getByTestId("audit-diff")).toContainText('["moderator"]');
    await expect(auditRow.getByTestId("audit-diff")).toContainText("(changed)");
    await axeBothThemes(page, "audit");

    await page.getByLabel("Reason", { exact: true }).fill("Checking the export works");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv.split("\r\n")[0]).toBe('"id","created_at","staff_id","staff_name","action","target_type","target_id","reason","before","after"');
    expect(csv).toContain(helper.id);
    const { data: exports } = await db.from("ops_audit_log").select("reason").eq("staff_id", admin.id).eq("action", "audit.export");
    expect(exports!.map((e) => e.reason)).toContain("Checking the export works");
    const { data: audit } = await db.from("ops_audit_log").select("action").eq("staff_id", admin.id).eq("target_id", helper.id);
    expect(audit!.map((a) => a.action).sort()).toEqual(["staff.grant", "staff.revoke"]);

    // Every /ops area passes axe in both themes inside the shell.
    for (const path of [
      "/ops",
      "/ops/reports",
      "/ops/appeals",
      "/ops/sanctions",
      "/ops/users",
      "/ops/evidence",
      "/ops/feedback",
      "/ops/teachers",
      "/ops/orgs",
      "/ops/universities",
      "/ops/exam-periods",
      "/ops/graduation",
      "/ops/billing",
    ]) {
      await page.goto(path);
      await expect(page.getByTestId("ops-sidebar")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await axeBothThemes(page, path);
    }
    expect(problems).toEqual([]);
  });
});
