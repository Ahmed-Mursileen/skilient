import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 11 slice 4 (PRD 5.26): a super admin saves a new version of a setting (diff, reason,
 * history), a value of the wrong shape is refused, plan prices and the skill dictionary are
 * edited with reasons, and /ops/metrics draws its charts with table views. axe in both themes.
 */
test.describe("Config and metrics", () => {
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

  test("versioned settings, prices, skills and metrics", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = adminClient();
    const tag = Math.random().toString(36).slice(2, 8);
    const admin = await createStudent({ domain: "nutech.edu.pk", fullName: `Sana Superadmin ${tag}` });
    await db.from("staff_roles").insert({ user_id: admin.id, role: "super_admin", granted_by: admin.id });
    const page = await twoFactorPage(browser, admin);
    const problems = watchConsole(page);

    // The list, then one setting.
    await page.goto("/ops/config");
    await expect(page.getByTestId("config-key").filter({ hasText: "ranking.formula" })).toContainText("Next nightly run");
    await axeBothThemes(page, "config");
    await page.getByRole("link", { name: "survey.min_latency_ms" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "survey.min_latency_ms" })).toBeVisible();
    const editor = page.getByRole("form", { name: "New version" });
    const value = editor.getByLabel("Value (JSON)");
    const before = Number((await value.inputValue()).trim());
    await axeBothThemes(page, "config key");

    // Invalid JSON can't be saved; the wrong shape is refused by the database.
    await value.fill("{");
    await expect(editor.getByText("That isn't valid JSON yet.")).toBeVisible();
    await expect(editor.getByRole("button", { name: /^Save version/ })).toBeDisabled();
    await value.fill('"fast"');
    await editor.getByLabel("Reason").fill("Trying a string");
    await editor.getByRole("button", { name: /^Save version/ }).click();
    await expect(editor.getByRole("alert")).toContainText("doesn't match the shape");

    // A real change: the diff shows it, the reason is required, a new version appears in history.
    await value.fill(String(before + 1));
    await expect(editor.getByTestId("config-diff")).toContainText(String(before + 1));
    await editor.getByLabel("Reason").fill("");
    await editor.getByRole("button", { name: /^Save version/ }).click();
    await expect(editor.getByRole("alert")).toContainText("Give a reason.");
    await editor.getByLabel("Reason").fill("Fast answers were wrongly discarded");
    await editor.getByRole("button", { name: /^Save version/ }).click();
    await expect(editor.getByRole("status")).toContainText(/Saved as version \d+/);
    await page.reload();
    const latest = page.getByTestId("config-version").first();
    await expect(latest).toContainText("Fast answers were wrongly discarded");
    await latest.getByText(/1 change from version/).click();
    await expect(latest.getByTestId("audit-diff")).toContainText(String(before + 1));

    // Put it back (another version, with a reason).
    await page.getByRole("form", { name: "New version" }).getByLabel("Value (JSON)").fill(String(before));
    await page.getByRole("form", { name: "New version" }).getByLabel("Reason").fill("Back to the original after the test");
    await page.getByRole("form", { name: "New version" }).getByRole("button", { name: /^Save version/ }).click();
    await expect(page.getByRole("form", { name: "New version" }).getByRole("status")).toContainText(/Saved as version \d+/);
    const { data: audit } = await db.from("ops_audit_log").select("action").eq("staff_id", admin.id).eq("target_id", "survey.min_latency_ms");
    expect(audit!.map((a) => a.action)).toEqual(["config.set", "config.set"]);

    // Plan prices: an unchanged price is refused with a reason.
    await page.goto("/ops/config/plans");
    await axeBothThemes(page, "plans");
    const row = page.getByTestId("plan-row").filter({ has: page.getByRole("button", { name: /^Change the price of/ }) }).first();
    await row.getByRole("button", { name: /^Change the price of/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason").fill("Checking the price dialog");
    await dialog.getByRole("button", { name: "Save price" }).click();
    await expect(dialog).toContainText("Nothing changed.");
    await page.keyboard.press("Escape");

    // Skills: add, then retire.
    await page.goto("/ops/config/skills");
    const add = page.getByRole("form", { name: "Add a skill" });
    await add.getByLabel("Id", { exact: true }).fill(`e2e-${tag}`);
    await add.getByLabel("Name", { exact: true }).fill(`E2E Framework ${tag}`);
    await add.getByLabel("Reason").fill("Requested in feedback");
    await add.getByRole("button", { name: "Add skill" }).click();
    await expect(add.getByRole("status")).toContainText("added");
    const skill = page.getByTestId("skill-row").filter({ hasText: `e2e-${tag}` });
    await skill.getByRole("button", { name: `Retire E2E Framework ${tag}` }).click();
    await page.getByRole("dialog").getByLabel("Reason").fill("Only for this test");
    await page.getByRole("dialog").getByRole("button", { name: "Retire" }).click();
    await expect(skill).toContainText("retired");
    await axeBothThemes(page, "skills");

    // Metrics: every chart renders, with a table view.
    await page.goto("/ops/metrics");
    await expect(page.getByTestId("metric-card")).toHaveCount(6);
    await expect(page.getByTestId("metric-card").first().locator("svg.recharts-surface")).toBeVisible();
    await expect(page.getByTestId("backlog-multiples").locator("li")).toHaveCount(5);
    await page.getByTestId("metric-card").first().getByText("Table view").click();
    await expect(page.getByRole("region", { name: "Signups as a table" }).getByRole("row")).toHaveCount(91);
    await axeBothThemes(page, "metrics");
    expect(problems).toEqual([]);
  });
});
