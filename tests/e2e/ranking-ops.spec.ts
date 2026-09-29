import AxeBuilder from "@axe-core/playwright";
import { randomInt } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 4 slice 5 (PRD 5.13 anti-gaming and decay, 5.26): accounts staff enter and remove a
 * university's exam period in /ops/exam-periods; a trust reviewer upholds a fast gain (a
 * negative adjustment of the same size) and clears an endorsement ring in /ops/evidence.
 * The nightly run that raises these flags is tested in pgTAP (34_ranking_nightly); here the
 * flags are recorded directly, as the run would leave them.
 */
test.describe("Ranking in /ops", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    await expect(page).toHaveTitle(/\S/);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  /** A staff member on a two-factor session. */
  async function staffPage(browser: Browser, who: TestStudent): Promise<Page> {
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

  test("accounts staff enter and remove an exam period, audited", async ({ browser }) => {
    test.setTimeout(120_000);
    const accounts = await createStudent({ domain: "nutech.edu.pk", fullName: "Ayesha Accounts" });
    const db = adminClient();
    await db.from("staff_roles").insert({ user_id: accounts.id, role: "accounts", granted_by: accounts.id });
    const page = await staffPage(browser, accounts);
    const problems = watchConsole(page);

    // Accounts staff land on their own area.
    await page.goto("/ops");
    await expect(page).toHaveURL(/\/ops\/exam-periods$/);
    await expect(page.getByRole("heading", { level: 1, name: "Exam periods" })).toBeVisible();
    await axe(page, "exam periods");

    // A far-future window of its own, so reruns never overlap.
    const year = 2090 + randomInt(0, 10);
    const month = String(randomInt(1, 12)).padStart(2, "0");
    const form = page.getByRole("region", { name: "Add an exam period" });
    await form.getByLabel("University").selectOption({ label: "National University of Technology (NUTECH)" });
    await form.getByLabel("First day").fill(`${year}-${month}-01`);
    await form.getByLabel("Last day").fill(`${year}-${month}-20`);
    await form.getByLabel("Reason").fill("Mid-terms, from the registrar's calendar");
    await form.getByRole("button", { name: "Add exam period" }).click();
    await expect(form.getByRole("status")).toContainText("Added");
    const row = page.getByTestId("exam-period-row").filter({ hasText: `${year}` }).filter({ hasText: "NUTECH" });
    await expect(row).toContainText("20 days");
    await axe(page, "exam periods (one added)");

    // Overlapping dates are refused with the reason.
    await form.getByLabel("University").selectOption({ label: "National University of Technology (NUTECH)" });
    await form.getByLabel("First day").fill(`${year}-${month}-10`);
    await form.getByLabel("Last day").fill(`${year}-${month}-25`);
    await form.getByLabel("Reason").fill("Duplicate entry");
    await form.getByRole("button", { name: "Add exam period" }).click();
    await expect(form.getByRole("alert")).toContainText("overlaps");

    // Removing asks for a reason.
    await row.getByRole("button", { name: /^Remove / }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this exam period?" });
    await dialog.getByRole("button", { name: "Remove" }).click();
    await expect(dialog).toContainText("Give a reason.");
    await dialog.getByLabel("Reason").fill("Entered for the wrong term");
    await dialog.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("exam-period-row").filter({ hasText: `${year}` })).toHaveCount(0);

    const { data: audit } = await db.from("ops_audit_log").select("action, reason").eq("staff_id", accounts.id).order("action");
    expect(audit!.map((a) => a.action)).toEqual(["exam_period.add", "exam_period.remove"]);
    expect(problems).toEqual([]);
  });

  test("a trust reviewer upholds a fast gain and clears a ring", async ({ browser }) => {
    test.setTimeout(150_000);
    const tag = Date.now().toString(36);
    const reviewer = await createStudent({ domain: "nutech.edu.pk", fullName: "Tariq Trust" });
    const fast = await createStudent({ domain: "nutech.edu.pk", fullName: `Sadia Sudden ${tag}` });
    const ringA = await createStudent({ domain: "nutech.edu.pk", fullName: `Rafay Ring ${tag}` });
    const ringB = await createStudent({ domain: "nutech.edu.pk", fullName: `Rida Ring ${tag}` });
    const db = adminClient();
    await db.from("staff_roles").insert({ user_id: reviewer.id, role: "trust_reviewer", granted_by: reviewer.id });

    // What the nightly run leaves: a held gain of 220 points...
    const now = new Date().toISOString();
    await db.from("ranking_scores").insert({
      user_id: fast.id, formula_version: 1, components: {}, proof: 40, momentum: 0, adjustments: 0, total: 40, ranked: true,
      tier: "raw", held: true, held_total: 260, computed_at: now, published_at: now,
    });
    const from = { work: 0, skills: 40, endorsements: 0, credentials: 0, momentum: 0, adjustments: 0, total: 40 };
    const to = { ...from, skills: 260, total: 260 };
    const { data: gain, error: gainError } = await db
      .from("anti_gaming_flags")
      .insert({ kind: "rapid_gain", user_id: fast.id, members: [fast.id], detail: { reason: "gain", from_total: 40, to_total: 260, gain: 220, exempt: 0, completions: 0, from, to } })
      .select("id")
      .single();
    expect(gainError).toBeNull();

    // ...and a ring: two teammates who endorsed each other on a venture with no outside evidence.
    const { data: profile } = await db.from("profiles").select("university_id").eq("user_id", ringA.id).single();
    const { data: venture } = await db
      .from("ventures")
      .insert({ type: "project", owner_id: ringA.id, university_id: profile!.university_id, title: `Ring venture ${tag}`, description: "d", status: "in_progress" })
      .select("id")
      .single();
    await db.from("venture_members").insert([
      { venture_id: venture!.id, user_id: ringA.id },
      { venture_id: venture!.id, user_id: ringB.id },
    ]);
    const { data: endorsements } = await db
      .from("endorsements")
      .insert([
        { endorser_id: ringA.id, endorsee_id: ringB.id, venture_id: venture!.id, skill_id: "react" },
        { endorser_id: ringB.id, endorsee_id: ringA.id, venture_id: venture!.id, skill_id: "react" },
      ])
      .select("id");
    const members = [ringA.id, ringB.id].sort();
    const { data: ring } = await db
      .from("anti_gaming_flags")
      .insert({ kind: "ring", members, endorsement_ids: endorsements!.map((e) => e.id).sort(), detail: { window_days: 180 } })
      .select("id")
      .single();

    const page = await staffPage(browser, reviewer);
    const problems = watchConsole(page);
    await page.goto("/ops/evidence?tab=ranking");
    const queue = page.getByTestId("ranking-flag-queue");
    await expect(queue.getByTestId("ranking-flag-row").filter({ hasText: `Sadia Sudden ${tag}` })).toContainText("+220.00 (40.00 to 260.00)");
    await expect(queue.getByTestId("ranking-flag-row").filter({ hasText: `Rafay Ring ${tag}` })).toContainText("2 endorsements");
    await axe(page, "ops ranking flags");

    // The fast gain: claim, uphold.
    await page.goto(`/ops/evidence/ranking/${gain!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Fast gain" })).toBeVisible();
    await expect(page.getByTestId("gain-table")).toContainText("260.00");
    await page.getByRole("button", { name: "Claim" }).click();
    await page.getByRole("radio", { name: /^Uphold/ }).check();
    await page.getByRole("textbox", { name: "Reason" }).fill("Skill levels set without the commits behind them");
    await axe(page, "ops fast gain (claimed)");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(page.getByTestId("flag-outcome")).toContainText("Upheld by Tariq Trust");
    const { data: adjustment } = await db.from("ranking_adjustments").select("kind, points").eq("user_id", fast.id).single();
    expect(adjustment).toEqual({ kind: "rapid_gain", points: -220 });

    // The ring: claim, clear.
    await page.goto(`/ops/evidence/ranking/${ring!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Endorsement ring" })).toBeVisible();
    await expect(page.getByTestId("flag-members")).toContainText(`Rida Ring ${tag}`);
    await expect(page.getByText(`via Ring venture ${tag}`).first()).toBeVisible();
    await page.getByRole("button", { name: "Claim" }).click();
    await page.getByRole("radio", { name: /^Clear/ }).check();
    await page.getByRole("textbox", { name: "Reason" }).fill("Classmates who really built it together");
    await axe(page, "ops ring (claimed)");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(page.getByTestId("flag-outcome")).toContainText("Cleared by Tariq Trust");

    await page.goto("/ops/evidence?tab=ranking_reviewed");
    await expect(page.getByTestId("ranking-flag-row").filter({ hasText: `Sadia Sudden ${tag}` })).toContainText("Upheld");
    const { data: audit } = await db.from("ops_audit_log").select("action").eq("staff_id", reviewer.id).order("action");
    expect(audit!.map((a) => a.action)).toEqual(["ranking_flag.claim", "ranking_flag.claim", "ranking_flag.clear", "ranking_flag.uphold"]);
    expect(problems).toEqual([]);
  });
});
