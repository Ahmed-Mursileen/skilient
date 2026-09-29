import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 4 slice 6 (PRD 5.17): the leaderboard (university with department and batch filters,
 * and global), the owner's score page, tier badges on profiles, post cards and Explore, and
 * the leaderboard opt-out. Scores are recorded directly, as the nightly run leaves them (the
 * run itself is tested in pgTAP 34_ranking_nightly).
 */
test.describe("Leaderboard and score", () => {
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

  /** A published score: `total` points and `tier`, with a skill and some Momentum behind it. */
  function score(student: TestStudent, total: number, tier: string, facts: Record<string, number | boolean> = {}) {
    const now = new Date().toISOString();
    return {
      user_id: student.id,
      formula_version: 1,
      proof: 15,
      momentum: total - 15,
      adjustments: 0,
      total,
      ranked: true,
      tier,
      tier_met: tier,
      percentile: 0.5,
      computed_at: now,
      published_at: now,
      components: {
        work: { points: 0, ventures: [], prs: { count: 0, points: 0, items: [] } },
        skills: { points: 15, categories: 1, bonus: false, items: [{ skill_id: "python", level: 2, points: 15 }] },
        endorsements: { points: 0, counting: 0, items: [] },
        credentials: { points: 0, items: [] },
        momentum: {
          points: total - 15,
          raw: total - 15,
          peak: total - 15,
          content: { points: total - 115, average: 80, posts: [] },
          consistency: { points: 100, weeks: 10 },
          citizenship: { points: 0, joins: 0, confirmations: 0 },
          decay: { weeks: 0, factor: 1, exam_days: 0, inactive_days: 2, last_active: now, exam_today: false },
        },
        adjustments: { points: 0, items: [] },
        facts: { peer_verified_entries: 1, active_ventures: 1, counting_endorsements: 0, completed_ventures: 0, max_level: 2, teacher_endorsement: false, hire: false, ...facts },
        proof: 15,
        total,
      },
    };
  }

  test("the board, your score, tier badges and opting out", async ({ page }) => {
    test.setTimeout(150_000);
    const problems = watchConsole(page);
    const tag = Date.now().toString(36);
    const department = `Ranking ${tag}`;
    const me = await createStudent({ domain: "nutech.edu.pk", fullName: `Mahnoor Me ${tag}` });
    const top = await createStudent({ domain: "nutech.edu.pk", fullName: `Talha Top ${tag}` });
    const tied = await createStudent({ domain: "nutech.edu.pk", fullName: `Tania Tied ${tag}` });
    const hidden = await createStudent({ domain: "nutech.edu.pk", fullName: `Hina Hidden ${tag}` });
    const db = adminClient();
    for (const s of [me, top, tied, hidden]) {
      await db.from("profiles").update({ department, graduation_year: 2027, visibility: "university" }).eq("user_id", s.id);
    }
    await db.from("profiles").update({ leaderboard_opt_out: true }).eq("user_id", hidden.id);
    const { error } = await db
      .from("ranking_scores")
      .insert([score(top, 640, "shine"), score(tied, 310, "flare"), score(me, 310, "flare"), score(hidden, 900, "shine")]);
    expect(error).toBeNull();
    // Talha posts, so his card shows a tier badge.
    const { data: postId } = await (await apiAs(top)).rpc("create_post", { p: { audience: "university", type: "general", body: `Shipped the timetable ${tag}` } });
    expect(postId).toBeTruthy();

    // The university board, filtered to this department: ties share a rank; the opted-out
    // student isn't on it; no points on anyone's row.
    await signInWithPassword(page, me.email, me.password);
    await page.goto("/leaderboard");
    await expect(page.getByRole("heading", { level: 1, name: "Leaderboard" })).toBeVisible();
    await page.getByLabel("Department").selectOption(department);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/department=Ranking/);
    const rows = page.getByTestId("leaderboard-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(`Talha Top ${tag}`);
    await expect(rows.nth(0)).toContainText("Shine");
    await expect(rows.filter({ hasText: `Tania Tied ${tag}` })).toContainText("2");
    await expect(rows.filter({ hasText: `Mahnoor Me ${tag}` })).toContainText("(you)");
    await expect(rows.filter({ hasText: `Mahnoor Me ${tag}` }).getByRole("cell").first()).toHaveText("2");
    await expect(page.getByTestId("leaderboard")).not.toContainText("640");
    await expect(page.getByText(`Hina Hidden ${tag}`)).toHaveCount(0);
    await expect(page.getByTestId("my-place")).toContainText("#2");
    await expect(page.getByTestId("my-place")).toContainText("of 3 on this board");
    await expect(page.getByTestId("my-place")).toContainText("310 points");
    await axe(page, "leaderboard (university)");

    await page.getByRole("link", { name: "Global" }).click();
    await expect(page).toHaveURL(/scope=global/);
    await expect(page.getByLabel("Department")).toHaveCount(0);
    await axe(page, "leaderboard (global)");

    // The score page: every component, what Shine needs.
    await page.getByTestId("my-place").getByRole("link", { name: /points: see how/ }).click();
    await expect(page).toHaveURL(/\/me\/score$/);
    await expect(page.getByTestId("score-total")).toContainText("310");
    await expect(page.getByTestId("score-total")).toContainText("Flare");
    await expect(page.getByTestId("component-skills")).toContainText("Python");
    await expect(page.getByTestId("component-momentum")).toContainText("active in 10 of the last 12 weeks");
    const next = page.getByTestId("next-tier");
    await expect(next.getByRole("heading", { name: "What Shine needs" })).toBeVisible();
    await expect(next).toContainText("190 more points");
    await expect(next).toContainText("A completed venture");
    await axe(page, "score");

    // Tier badges on a profile and a post card.
    await page.goto(`/profile/${top.username}`);
    await expect(page.getByRole("heading", { level: 1, name: `Talha Top ${tag}` })).toBeVisible();
    await expect(page.getByRole("main").getByText("Shine", { exact: true }).first()).toBeVisible();
    await page.goto(`/post/${postId}`);
    await expect(page.getByTestId("post").filter({ hasText: `Shipped the timetable ${tag}` })).toContainText("Shine");

    // Opting out: off every board, the tier stays.
    await page.goto("/settings/privacy");
    await expect(page.getByRole("switch", { name: "Show me on leaderboards" })).toBeChecked();
    await axe(page, "privacy settings");
    await page.getByRole("switch", { name: "Show me on leaderboards" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.goto(`/leaderboard?department=${encodeURIComponent(department)}`);
    await expect(page.getByTestId("my-place")).toContainText("You’ve left the leaderboards");
    await expect(page.getByTestId("leaderboard-row")).toHaveCount(2);
    await page.goto(`/profile/${me.username}`);
    await expect(page.getByRole("main").getByText("Flare", { exact: true }).first()).toBeVisible();

    expect(problems).toEqual([]);
  });
});
