import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 3 slice 5 (PRD 5.28 micro-survey): the strip renders under every surveyable post
 * except your own, with no dismiss control; the question stays the same across reloads;
 * answering settles into "Answered" with a 10-minute Change; an answer before a qualified
 * view is refused over the API; a free author's Insights explains the upgrade.
 */
test.describe("Micro-survey", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  function apiAs(student: TestStudent) {
    const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const api = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    return api.auth.signInWithPassword({ email: student.email, password: student.password }).then(() => api);
  }

  test("strip, fixed question, answer, change, insights", async ({ page, browser }) => {
    test.setTimeout(150_000);
    const problems = watchConsole(page);
    const author = await createStudent({ domain: "nutech.edu.pk", fullName: "Sara Surveyed" });
    const reader = await createStudent({ domain: "nutech.edu.pk", fullName: "Rafay Reader" });
    const late = await createStudent({ domain: "nutech.edu.pk", fullName: "Lina Late" });
    const text = `Notes from the ML workshop ${Date.now().toString(36)}`;

    await signInWithPassword(page, author.email, author.password);
    await page.goto("/feed");
    await page.getByTestId("composer").getByLabel("What's on your mind?").fill(text);
    await page.getByTestId("composer").getByRole("button", { name: "Post", exact: true }).click();
    const own = page.getByTestId("post").filter({ hasText: text });
    await expect(own).toBeVisible();
    await expect(own.getByTestId("survey-strip")).toHaveCount(0);

    // A reader sees the strip: a question, Yes and No, nothing to dismiss or skip.
    const rPage = await (await browser.newContext()).newPage();
    await signInWithPassword(rPage, reader.email, reader.password);
    await rPage.goto("/feed");
    const card = rPage.getByTestId("post").filter({ hasText: text });
    const strip = card.getByTestId("survey-strip");
    await expect(strip).toBeVisible();
    const question = (await strip.locator("p").first().textContent())!.trim();
    expect(question.endsWith("?")).toBe(true);
    await expect(strip.getByRole("button")).toHaveCount(2);
    await expect(strip.getByRole("button", { name: "Yes", exact: true })).toBeVisible();
    await expect(strip.getByRole("button", { name: "No", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: /dismiss|skip|close|hide survey/i })).toHaveCount(0);
    await axe(rPage, "feed with survey strip");

    // The question never changes, even after reloads.
    for (let i = 0; i < 2; i++) {
      await rPage.reload();
      await expect(rPage.getByTestId("post").filter({ hasText: text }).getByTestId("survey-strip").locator("p").first()).toHaveText(question);
    }

    // Answer once the post has been on screen for 1.5 s; then change it.
    await rPage.waitForTimeout(1_800);
    await rPage.getByTestId("post").filter({ hasText: text }).getByRole("button", { name: "Yes", exact: true }).click();
    const answered = rPage.getByTestId("post").filter({ hasText: text }).getByTestId("survey-answered");
    await expect(answered).toContainText("Answered");
    await expect(answered.getByTestId("public-line")).toHaveCount(0); // under 3 ticks
    await answered.getByRole("button", { name: "Change" }).click();
    await rPage.getByTestId("post").filter({ hasText: text }).getByRole("button", { name: "No", exact: true }).click();
    await expect(rPage.getByTestId("post").filter({ hasText: text }).getByTestId("survey-answered")).toBeVisible();
    await rPage.reload();
    await expect(rPage.getByTestId("post").filter({ hasText: text }).getByTestId("survey-answered")).toContainText("Answered");

    // Over the API: an answer before any view is refused; a second answer can only change.
    const api = await apiAs(late);
    const { data: posts } = await api.from("posts").select("id").eq("body", text);
    const postId = posts![0].id as string;
    await api.rpc("survey_for_posts", { p_ids: [postId] });
    const early = await api.rpc("answer_survey", { p_post: postId, p_answer: true, p_latency_ms: 5000 });
    expect(early.error?.code).toBe("55000");
    const fake = await api.from("micro_survey_responses").insert({ post_id: postId, user_id: late.id, question_id: 1, dimension: "informative", answer: true, latency_ms: 5000, weight: 1, locked_at: new Date().toISOString() });
    expect(fake.error?.code).toBe("42501");

    // A free author's Insights explains the upgrade; the data is refused.
    await own.getByRole("button", { name: "Insights" }).click();
    await expect(page.getByTestId("insights-upgrade")).toContainText("Post insights come with Student Pro.");
    await axe(page, "insights dialog");
    const authorApi = await apiAs(author);
    const insights = await authorApi.rpc("post_insights", { p_post: postId });
    expect(insights.error?.code).toBe("42501");

    expect(problems).toEqual([]);
  });
});
