import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 11 slice 2 (PRD 5.26): a moderator suspends a student (never beyond 7 days); the student
 * sees the banner and appeals; the moderator who decided can't take the appeal; a second
 * moderator overturns it and the suspension is gone. axe in both themes on each new page.
 */
test.describe("Sanctions and appeals", () => {
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

  test("suspend, appeal, and a different moderator overturns", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = adminClient();
    const tag = Math.random().toString(36).slice(2, 8);
    const first = await createStudent({ domain: "nutech.edu.pk", fullName: `Maria Moderator ${tag}` });
    const second = await createStudent({ domain: "nutech.edu.pk", fullName: `Nabeel Moderator ${tag}` });
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: `Saad Student ${tag}` });
    await db.from("staff_roles").insert([
      { user_id: first.id, role: "moderator", granted_by: first.id },
      { user_id: second.id, role: "moderator", granted_by: first.id },
    ]);
    const mPage = await twoFactorPage(browser, first);
    const nPage = await twoFactorPage(browser, second);
    const problems = watchConsole(mPage);

    // A moderator finds the account and suspends it; nothing past 7 days is offered.
    await mPage.goto("/ops/sanctions");
    await mPage.getByLabel("Email or username").fill(student.email);
    await mPage.getByRole("button", { name: "Find" }).click();
    const form = mPage.getByRole("form", { name: `Sanction Saad Student ${tag}` });
    await expect(form).toBeVisible();
    await expect(form.getByRole("radio", { name: "Ban" })).toHaveCount(0);
    const days = form.getByLabel("How long");
    await expect(days.locator("option")).toHaveText(["1 day", "2 days", "3 days", "5 days", "7 days"]);
    await days.selectOption("3");
    await form.getByLabel(/^Reason/).fill("Posting the same link in every thread");
    await form.getByRole("button", { name: `Suspend Saad Student ${tag}` }).click();
    await expect(form.getByRole("status")).toContainText("suspended for 3 days");
    await mPage.goto("/ops/sanctions");
    await expect(mPage.getByTestId("sanction-row").filter({ hasText: `Saad Student ${tag}` })).toContainText("Suspension");
    await axeBothThemes(mPage, "sanctions");

    // The student (signed out by the suspension) signs back in to a read-only account.
    const sPage = await (await browser.newContext()).newPage();
    await signInWithPassword(sPage, student.email, student.password);
    await sPage.goto("/feed");
    await expect(sPage.getByTestId("restriction-banner")).toContainText("Your account is suspended");
    await sPage.goto("/appeals");
    const item = sPage.getByTestId("appealable").filter({ hasText: "Suspension on your account" });
    await expect(item).toContainText("Posting the same link in every thread");
    await axeBothThemes(sPage, "appeals");
    await item.getByRole("button", { name: /^Appeal:/ }).click();
    const dialog = sPage.getByRole("dialog", { name: "Appeal this decision" });
    await dialog.getByLabel("Why should it change?").fill("Those were links to my own venture's demo, shared once per relevant thread.");
    await dialog.getByRole("button", { name: "Send appeal" }).click();
    await expect(dialog).toBeHidden();
    await expect(sPage.getByTestId("my-appeal")).toContainText("Waiting for a decision");
    await expect(sPage.getByTestId("appealable")).toHaveCount(0);

    // The moderator who suspended sees the appeal but can't decide it.
    await mPage.goto("/ops/appeals");
    const row = mPage.getByTestId("appeal-row").filter({ hasText: `Saad Student ${tag}` });
    await expect(row).toContainText("Your decision");
    await row.getByRole("link").click();
    await expect(mPage.getByTestId("appeal-decision")).toContainText("another staff member must decide this appeal");
    await expect(mPage.getByRole("button", { name: "Claim" })).toHaveCount(0);

    // A second moderator finds it in the inbox, claims it and overturns it.
    await nPage.goto("/ops?queue=appeals");
    await nPage.getByTestId("inbox-item").filter({ hasText: "Those were links" }).getByRole("link").click();
    await expect(nPage.getByTestId("appeal-body")).toContainText("my own venture's demo");
    await nPage.getByRole("button", { name: "Claim" }).click();
    await nPage.getByRole("radio", { name: /^Overturn/ }).check();
    await nPage.getByLabel(/^Reason/).fill("Links were to the student's own venture, posted where relevant");
    await axeBothThemes(nPage, "appeal (claimed)");
    await nPage.getByRole("radio", { name: /^Overturn/ }).check();
    await nPage.getByLabel(/^Reason/).fill("Links were to the student's own venture, posted where relevant");
    await nPage.getByRole("button", { name: "Confirm decision" }).click();
    await expect(nPage.getByTestId("appeal-decision")).toContainText("Decision reversed");
    await expect(nPage.getByTestId("appeal-decision")).toContainText("Final.");

    // The suspension is gone for the student.
    await sPage.goto("/feed");
    await expect(sPage.getByTestId("restriction-banner")).toHaveCount(0);
    await sPage.goto("/appeals");
    await expect(sPage.getByTestId("my-appeal")).toContainText("Decision reversed");

    const { data: audit } = await db.from("ops_audit_log").select("action, staff_id").in("staff_id", [first.id, second.id]);
    const actions = audit!.map((a) => `${a.staff_id === first.id ? "first" : "second"}:${a.action}`).sort();
    expect(actions).toEqual(["first:sanction.suspend", "second:appeal.claim", "second:appeal.overturned"]);
    expect(problems).toEqual([]);
  });
});
