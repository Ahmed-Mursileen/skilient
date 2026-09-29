import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 3 slice 8 (PRD 5.10): one search box over people, projects and startups; the URL
 * holds the query; people from other universities are found with their friendship state
 * and can be added; blocked people never appear; filters narrow and can be cleared.
 */
test.describe("Explore", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    await expect(page).toHaveTitle(/\S/);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  function apiAs(student: TestStudent) {
    const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const api = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    return api.auth.signInWithPassword({ email: student.email, password: student.password }).then(() => api);
  }

  test("people and ventures, friendship state, blocks, filters", async ({ page }) => {
    test.setTimeout(120_000);
    const problems = watchConsole(page);
    // Letters only, so the name tokenises as one searchable word.
    const tag = `xq${Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)])}`;
    const me = await createStudent({ domain: "nutech.edu.pk", fullName: "Explorer Me" });
    const found = await createStudent({ domain: "nu.edu.pk", fullName: `Farah ${tag}` });
    const blocker = await createStudent({ domain: "nutech.edu.pk", fullName: `Hidden ${tag}` });
    await adminClient().from("blocks").insert({ blocker_id: blocker.id, blocked_id: me.id });
    const foundApi = await apiAs(found);
    await foundApi.rpc("create_venture", { p: { type: "project", title: `Water sensor ${tag}`, description: "Low-cost river monitoring" } });

    await signInWithPassword(page, me.email, me.password);
    await page.goto("/explore");
    await expect(page.getByText("Search for someone")).toBeVisible();
    await axe(page, "explore (empty)");

    // Part of a name, from another university; the URL carries the query.
    await page.getByRole("searchbox", { name: "Search people, projects and startups" }).fill(tag.slice(0, 6));
    await expect(page).toHaveURL(new RegExp(`/explore\\?q=${tag.slice(0, 6)}`));
    const row = page.getByTestId("person-result").filter({ hasText: found.fullName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("FAST");
    // Blocked either way: never listed.
    await expect(page.getByTestId("person-result").filter({ hasText: blocker.fullName })).toHaveCount(0);
    await axe(page, "explore (people)");

    // Add friend from the result; the state sticks after a reload.
    await row.getByRole("button", { name: `Add ${found.fullName} as a friend` }).click();
    await expect(row.getByTestId("friendship")).toHaveText("Request sent");
    await page.reload();
    await expect(page.getByTestId("person-result").filter({ hasText: found.fullName }).getByTestId("friendship")).toHaveText("Request sent");

    // A filter that matches nobody offers to clear itself.
    await page.getByLabel("Department").fill("Architecture");
    await expect(page.getByText("No results")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByTestId("person-result").filter({ hasText: found.fullName })).toBeVisible();

    // Projects tab: same query, the venture's title matches.
    await page.getByRole("navigation", { name: "Result type" }).getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/tab=projects/);
    await expect(page.getByTestId("venture-results").getByRole("link", { name: `Water sensor ${tag}` })).toBeVisible();
    await axe(page, "explore (projects)");
    await page.getByRole("navigation", { name: "Result type" }).getByRole("link", { name: "Startups" }).click();
    await expect(page.getByText("No results")).toBeVisible();

    // Back returns to the previous search.
    await page.goBack();
    await expect(page.getByTestId("venture-results")).toBeVisible();

    expect(problems).toEqual([]);
  });
});
