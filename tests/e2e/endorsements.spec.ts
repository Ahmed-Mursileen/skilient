import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 4 slice 1 (PRD 5.16): a teammate endorses another from the venture's Team tab, tied
 * to one of their entries, with a note; the endorsee is notified, sees it on their profile and
 * hides it, after which others no longer see it. Limits are refused through the raw API too.
 */
test.describe("Endorsements", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    // Next streams page metadata: wait for the <title> before checking the document.
    await expect(page).toHaveTitle(/\S/);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  function apiAs(student: TestStudent) {
    const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const api = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    return api.auth.signInWithPassword({ email: student.email, password: student.password }).then(() => api);
  }

  test("endorse a teammate, the endorsee sees and hides it, limits hold through the API", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const a = await createStudent({ domain: "nutech.edu.pk", fullName: "Asad Endorser" });
    const b = await createStudent({ domain: "nutech.edu.pk", fullName: "Bushra Builder" });
    const outsider = await createStudent({ domain: "nu.edu.pk", fullName: "Omer Outside" });
    const tag = Date.now().toString(36);

    // A team of two, building, with one entry by B to cite.
    const aApi = await apiAs(a);
    const bApi = await apiAs(b);
    const { data: ventureId, error: createError } = await aApi.rpc("create_venture", {
      p: { type: "project", title: `Fee tracker ${tag}`, description: "Track semester fees.", skill_ids: ["react", "typescript"] },
    });
    expect(createError).toBeNull();
    const { data: app } = await bApi.rpc("apply_to_venture", { p_venture: ventureId, p_message: "I can build the UI" });
    expect((await aApi.rpc("decide_application", { p_thread: app, p_accept: true })).error).toBeNull();
    expect((await bApi.rpc("log_contribution", { p_venture: ventureId, p_kind: "code", p_description: `Built the fee table ${tag}`, p_skill_ids: ["react"] })).error).toBeNull();

    // Recruiting: nothing to endorse yet, so no button.
    await signInWithPassword(page, a.email, a.password);
    await page.goto(`/ventures/${ventureId}/team`);
    await expect(page.getByText("2 of 4 members. A venture has at most 6.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Endorse teammates" })).toHaveCount(0);
    expect((await aApi.rpc("transition_venture", { p_venture: ventureId, p_to: "in_progress" })).error).toBeNull();

    // In progress: A endorses B for React, tied to B's entry, with a note.
    await page.reload();
    await page.getByRole("button", { name: "Endorse teammates" }).click();
    const sheet = page.getByRole("dialog", { name: "Endorse teammates" });
    await expect(sheet.getByText("Bushra Builder")).toBeVisible();
    await expect(sheet.getByText("Teammate 1 of 1")).toBeVisible();
    await sheet.getByRole("checkbox", { name: "React" }).check();
    await sheet.getByRole("combobox", { name: "React" }).selectOption({ label: `Built the fee table ${tag}` });
    await sheet.getByLabel("Note (optional)").fill("Clean components and quick reviews.");
    await axe(page, "endorse sheet");
    await sheet.getByRole("button", { name: "Endorse Bushra" }).click();
    await expect(sheet.getByText("That's everyone on the team.")).toBeVisible();
    await sheet.getByRole("button", { name: "Start again" }).click();
    await expect(sheet.getByText("Endorsed")).toBeVisible();
    await expect(sheet.getByRole("checkbox", { name: /React/ })).toBeDisabled();
    await sheet.getByRole("button", { name: "Close" }).click();

    // The raw API refuses the limits the sheet enforces.
    const again = await aApi.rpc("endorse", { p_endorsee: b.id, p_venture: ventureId, p_items: [{ skill: "react" }] });
    expect(again.error?.code).toBe("23505");
    const tooMany = await aApi.rpc("endorse", {
      p_endorsee: b.id,
      p_venture: ventureId,
      p_items: ["typescript", "javascript", "html", "css", "nodejs"].map((skill) => ({ skill })),
    });
    expect(tooMany.error).not.toBeNull();
    const outsiderApi = await apiAs(outsider);
    const forged = await outsiderApi.rpc("endorse", { p_endorsee: b.id, p_venture: ventureId, p_items: [{ skill: "react" }] });
    expect(forged.error?.code).toBe("P0002");
    const self = await bApi.rpc("endorse", { p_endorsee: b.id, p_venture: ventureId, p_items: [{ skill: "react" }] });
    expect(self.error?.code).toBe("42501");
    expect((await outsiderApi.from("endorsements").select("id")).data).toEqual([]);

    // B is notified and sees it on their profile; hides it.
    const bContext = await browser.newContext();
    const bPage = await bContext.newPage();
    await signInWithPassword(bPage, b.email, b.password);
    await bPage.goto("/notifications");
    await bPage.getByRole("link", { name: /Asad Endorser endorsed you for React/ }).click();
    await expect(bPage).toHaveURL(new RegExp(`/profile/${b.username}#endorsements$`));
    const section = bPage.locator("#endorsements-section");
    await expect(section.getByRole("heading", { name: "React" })).toBeVisible();
    await expect(section.getByText("Clean components and quick reviews.")).toBeVisible();
    await expect(section.getByText("Tied to a contribution")).toBeVisible();
    await axe(bPage, "profile endorsements (owner)");

    // A classmate (A) sees it too, until B hides it.
    await page.goto(`/profile/${b.username}`);
    await expect(page.locator("#endorsements-section").getByText("Clean components and quick reviews.")).toBeVisible();
    await section.getByRole("button", { name: "Hide Asad Endorser's endorsement" }).click();
    await expect(section.getByText("Hidden from others")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Endorsements" })).toHaveCount(0);
    await section.getByRole("button", { name: "Show Asad Endorser's endorsement" }).click();
    await expect(section.getByText("Hidden from others")).toHaveCount(0);

    // The completion prompt opens the sheet straight away.
    await page.goto(`/ventures/${ventureId}/team?endorse=1`);
    await expect(page.getByRole("dialog", { name: "Endorse teammates" })).toBeVisible();

    await bContext.close();
    expect(problems).toEqual([]);
  });
});
