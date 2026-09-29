import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 4 slice 2 (PRD 5.5 L3/L4): a member tags a contribution with a skill, a teammate
 * confirms it and the skill shows L3 with the confirmation behind it; two teammates from two
 * ventures vouch for it tied to entries that show it, and it becomes L4.
 */
test.describe("L3 and L4 levels", () => {
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

  test("a confirmed tagged entry makes L3; two evidence-tied endorsements from two ventures make L4", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const a = await createStudent({ domain: "nutech.edu.pk", fullName: "Ali Owner" });
    const b = await createStudent({ domain: "nutech.edu.pk", fullName: "Bano Builder" });
    const c = await createStudent({ domain: "nutech.edu.pk", fullName: "Chand Second" });
    const tag = Date.now().toString(36);
    const [aApi, bApi, cApi] = await Promise.all([apiAs(a), apiAs(b), apiAs(c)]);

    async function team(owner: typeof aApi, title: string) {
      const { data: id } = await owner.rpc("create_venture", { p: { type: "project", title, description: "d", skill_ids: ["react", "typescript"] } });
      const { data: app } = await bApi.rpc("apply_to_venture", { p_venture: id, p_message: "In" });
      expect((await owner.rpc("decide_application", { p_thread: app, p_accept: true })).error).toBeNull();
      expect((await owner.rpc("transition_venture", { p_venture: id, p_to: "in_progress" })).error).toBeNull();
      return id as string;
    }
    const v1 = await team(aApi, `Hostel app ${tag}`);
    const v2 = await team(cApi, `Library app ${tag}`);

    // B logs work on v1 and tags it React.
    await signInWithPassword(page, b.email, b.password);
    await page.goto(`/ventures/${v1}/contributions`);
    await page.getByRole("button", { name: "Log contribution" }).click();
    const sheet = page.getByRole("dialog", { name: "Log a contribution" });
    await sheet.getByLabel("What you did").fill(`Built the room booking screen ${tag}`);
    await sheet.getByRole("checkbox", { name: "React" }).check();
    await axe(page, "log contribution with skills");
    await sheet.getByRole("button", { name: "Log contribution" }).click();
    const entry = page.getByRole("listitem", { name: /Bano Builder/ }).filter({ hasText: `room booking screen ${tag}` });
    await expect(entry.getByRole("list", { name: "Skills it shows" }).getByText("React")).toBeVisible();

    // Not yet L3: nobody confirmed it.
    await page.goto(`/profile/${b.username}/skills`);
    await expect(page.getByRole("button", { name: /^React, level 3/ })).toHaveCount(0);

    // A confirms from the Contributions tab.
    const aContext = await browser.newContext();
    const aPage = await aContext.newPage();
    await signInWithPassword(aPage, a.email, a.password);
    await aPage.goto(`/ventures/${v1}/contributions`);
    await aPage.getByRole("button", { name: "Confirm Bano Builder's entry" }).click();
    await expect(aPage.getByText("You confirmed this.")).toBeVisible();

    // B's React is L3, and the drawer shows why.
    await page.reload();
    await page.getByRole("button", { name: /^React, level 3/ }).click();
    const drawer = page.getByRole("dialog", { name: "React" });
    await expect(drawer.getByText("Confirmed contribution")).toBeVisible();
    await expect(drawer.getByText(`Built the room booking screen ${tag}`)).toBeVisible();
    await axe(page, "skill drawer with proofs");
    await drawer.getByRole("button", { name: "Close" }).click();

    // Two teammates from two ventures vouch, tied to entries that show React: L4.
    const { data: entries } = await bApi.from("contributions").select("id").eq("venture_id", v1).eq("user_id", b.id);
    const { data: e2 } = await bApi.rpc("log_contribution", { p_venture: v2, p_kind: "code", p_description: "Built the catalogue", p_skill_ids: ["react"] });
    // Evidence that doesn't show the skill is refused.
    const wrong = await aApi.rpc("endorse", { p_endorsee: b.id, p_venture: v1, p_items: [{ skill: "typescript", evidence: entries![0].id }] });
    expect(wrong.error?.code).toBe("22023");
    expect((await aApi.rpc("endorse", { p_endorsee: b.id, p_venture: v1, p_items: [{ skill: "react", evidence: entries![0].id }] })).error).toBeNull();
    expect((await cApi.rpc("endorse", { p_endorsee: b.id, p_venture: v2, p_items: [{ skill: "react", evidence: e2 }] })).error).toBeNull();
    await page.reload();
    await expect(page.getByRole("button", { name: /^React, level 4: .*peer-verified/ })).toBeVisible();

    // A classmate sees the level, not the proofs.
    await aPage.goto(`/profile/${b.username}/skills`);
    await aPage.getByRole("button", { name: /^React, level 4/ }).click();
    await expect(aPage.getByRole("dialog", { name: "React" }).getByText("Confirmed contribution")).toHaveCount(0);

    await aContext.close();
    expect(problems).toEqual([]);
  });
});
