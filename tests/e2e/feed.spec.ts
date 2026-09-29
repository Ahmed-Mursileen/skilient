import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole } from "./support";

/**
 * Phase 3 slice 6 (PRD 5.28 feed algorithm): paging a ranked feed shows every post once,
 * new posts arrive as a pill (not mid-scroll), and updates from followed ventures come
 * after the ranked posts.
 */
test.describe("Ranked feed", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  /** Loads pages until the feed ends (the infinite scroll may load some by itself). */
  async function scrollToEnd(page: Page) {
    for (let i = 0; i < 30; i++) {
      if (await page.getByTestId("feed-end").isVisible()) return;
      const more = page.getByRole("button", { name: "Load more" });
      if (await more.isEnabled({ timeout: 1_000 }).catch(() => false)) await more.click({ timeout: 2_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    }
    await expect(page.getByTestId("feed-end")).toBeVisible();
  }

  test("paging without duplicates, new posts pill, followed venture updates", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    // A university of its own for this test so other tests' posts don't mix in.
    const db = adminClient();
    const reader = await createStudent({ domain: "nu.edu.pk", fullName: "Fiza Feedreader" });
    const writer = await createStudent({ domain: "nu.edu.pk", fullName: "Waqas Writer" });
    const { data: profile } = await db.from("profiles").select("university_id").eq("user_id", writer.id).single();
    const tag = Date.now().toString(36);

    // 45 posts in Full, spread over the last few hours.
    const rows = Array.from({ length: 45 }, (_, i) => ({
      author_id: writer.id,
      university_id: profile!.university_id,
      audience: "university",
      type: "general",
      body: `Feed post ${tag} #${i + 1}`,
      stage: "full",
      created_at: new Date(Date.now() - (i + 1) * 4 * 60_000).toISOString(),
    }));
    const { error } = await db.from("posts").insert(rows);
    expect(error).toBeNull();

    await signInWithPassword(page, reader.email, reader.password);
    await page.goto("/feed");
    const mine = page.getByTestId("post").filter({ hasText: `Feed post ${tag}` });
    await expect(mine.first()).toBeVisible();
    await axe(page, "ranked feed");
    // Scroll until the list ends; every post appears exactly once.
    await scrollToEnd(page);
    await expect(page.getByTestId("feed-end")).toBeVisible();
    const ids = await page.getByTestId("post").evaluateAll((els) => els.map((e) => e.getAttribute("data-post-id")));
    expect(new Set(ids).size).toBe(ids.length);
    expect(await mine.count()).toBe(45);

    // A new post arrives: a pill, not a jump.
    const writerPage = await (await browser.newContext()).newPage();
    await signInWithPassword(writerPage, writer.email, writer.password);
    await writerPage.goto("/feed");
    await writerPage.getByTestId("composer").getByLabel("What's on your mind?").fill(`Fresh news ${tag}`);
    await writerPage.getByTestId("composer").getByRole("button", { name: "Post", exact: true }).click();
    await expect(writerPage.getByTestId("post").filter({ hasText: `Fresh news ${tag}` })).toBeVisible();
    await expect(page.getByTestId("new-posts-pill")).toContainText("1 new post", { timeout: 15_000 });
    await expect(page.getByTestId("post").filter({ hasText: `Fresh news ${tag}` })).toHaveCount(0);
    await page.getByTestId("new-posts-pill").getByRole("button").click();
    // Same programme and university: the reader is in the new post's seed audience.
    await expect(page.getByTestId("post").filter({ hasText: `Fresh news ${tag}` })).toBeVisible();
    await expect(page.getByTestId("new-posts-pill")).toHaveCount(0);

    // Updates from a followed venture come after the ranked posts.
    const { data: ventureId } = await (async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const api = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      await api.auth.signInWithPassword({ email: writer.email, password: writer.password });
      const created = await api.rpc("create_venture", { p: { type: "project", title: `Hydroponics ${tag}`, description: "Rooftop farm." } });
      await api.rpc("post_venture_update", { p_venture: created.data, p_body: `Seedlings are up ${tag}` });
      return created;
    })();
    await page.goto(`/ventures/${ventureId}`);
    await page.getByRole("button", { name: "Follow" }).click();
    await expect(page.getByRole("button", { name: /Following|Unfollow/ })).toBeVisible();
    await page.goto("/feed");
    await scrollToEnd(page);
    const updates = page.getByTestId("followed-updates");
    await expect(updates).toContainText(`Seedlings are up ${tag}`);
    await expect(updates.getByRole("link", { name: `Hydroponics ${tag}` })).toBeVisible();

    expect(problems).toEqual([]);
  });
});
