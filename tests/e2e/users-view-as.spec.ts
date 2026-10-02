import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 11 slice 3 (PRD 5.26): a super admin finds a student, reads the record, views the account
 * as the student (read-only, logged, the student is told), then resets the student's two-factor
 * after an identity check. axe in both themes on each new page.
 */
test.describe("Users, view-as and two-factor reset", () => {
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

  async function twoFactorPage(browser: Browser, who: TestStudent): Promise<Page> {
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

  test("search, record, view-as and reset two-factor", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = adminClient();
    const tag = Math.random().toString(36).slice(2, 8);
    const admin = await createStudent({ domain: "nutech.edu.pk", fullName: `Sana Superadmin ${tag}` });
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: `Zoya Lockedout ${tag}` });
    await db.from("staff_roles").insert({ user_id: admin.id, role: "super_admin", granted_by: admin.id });
    const page = await twoFactorPage(browser, admin);
    const sPage = await twoFactorPage(browser, student);
    const problems = watchConsole(page);

    // Search by email, open the record.
    await page.goto("/ops/users");
    await page.getByLabel("Name, username, email or GitHub").fill(student.email);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByTestId("user-hit").getByRole("link", { name: `Zoya Lockedout ${tag}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Zoya Lockedout ${tag}` })).toBeVisible();
    await expect(page.getByTestId("user-account")).toContainText("On (10 backup codes left)");
    await axeBothThemes(page, "user record");
    await page.goto("/ops/users?q=lockedout");
    await expect(page.getByTestId("user-hit").filter({ hasText: `Zoya Lockedout ${tag}` })).toBeVisible();
    await axeBothThemes(page, "user search");

    // View as the student: a reason is required, the view is read-only and logged.
    await page.getByTestId("user-hit").getByRole("link", { name: `Zoya Lockedout ${tag}` }).click();
    const view = page.getByRole("form", { name: `View as Zoya Lockedout ${tag}` });
    await view.getByRole("button", { name: "Start viewing" }).click();
    await expect(view.getByRole("alert")).toContainText("Give a reason.");
    await view.getByLabel("Reason (they read it)").fill("a support request about your profile");
    await view.getByRole("button", { name: "Start viewing" }).click();
    await expect(page).toHaveURL(new RegExp(`/ops/users/${student.id}/view/profile$`));
    await expect(page.getByTestId("view-as-banner")).toContainText(`Viewing as Zoya Lockedout ${tag}, read-only.`);
    await expect(page.getByTestId("view-as-content")).toContainText(`Zoya Lockedout ${tag}`);
    await axeBothThemes(page, "view as (profile)");
    await page.getByRole("navigation", { name: "Their pages" }).getByRole("link", { name: "Notifications" }).click();
    await expect(page.getByTestId("view-as-content")).toContainText("Skilient support viewed your account on");
    await expect(page.getByRole("navigation", { name: "Their pages" }).getByRole("link", { name: /chat/i })).toHaveCount(0);
    await expect(page.getByTestId("view-as-content").getByRole("link")).toHaveCount(0);

    // The student is told, with the reason.
    await sPage.goto("/notifications");
    await expect(sPage.getByText("Skilient support viewed your account on")).toBeVisible();
    await expect(sPage.getByText("for a support request about your profile.")).toBeVisible();

    // Reset two-factor: the identity note must say how; then the factors are gone.
    await page.goto(`/ops/users/${student.id}`);
    const reset = page.getByRole("form", { name: "Reset two-factor" });
    await reset.getByLabel(/^Identity check/).fill("checked");
    await reset.getByRole("button", { name: "Reset two-factor" }).click();
    await expect(reset.getByRole("alert")).toContainText("at least 20 characters");
    await reset.getByLabel(/^Identity check/).fill("Asked from her university email; confirmed on a video call with her student card");
    await reset.getByRole("button", { name: "Reset two-factor" }).click();
    await expect(reset.getByRole("status")).toContainText("Two-factor was reset");
    const { data: factors } = await db.auth.admin.mfa.listFactors({ userId: student.id });
    expect(factors?.factors ?? []).toEqual([]);
    await page.reload();
    await expect(page.getByTestId("user-account")).toContainText("Off");

    const { data: audit } = await db.from("ops_audit_log").select("action, reason").eq("staff_id", admin.id).eq("target_id", student.id);
    expect(audit!.map((a) => a.action).sort()).toEqual(["user.mfa_reset", "view_as.start"]);
    expect(audit!.find((a) => a.action === "user.mfa_reset")?.reason).toContain("video call");
    expect(problems).toEqual([]);
  });
});
