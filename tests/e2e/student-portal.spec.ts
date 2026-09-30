import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 6 (PRD 5.25, 5.27): the five-area shell, the guided tour by keyboard, the progress
 * card, first-visit tips, the Opportunities hub, the feedback centre, graduates and account
 * deletion with its cooling-off.
 */
test.describe("Student portal", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");

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

  test("the shell, the tour by keyboard, the progress card and the tips", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once, on desktop");
    test.setTimeout(150_000);
    const problems = watchConsole(page);
    const me = await createStudent({ domain: "nutech.edu.pk", fullName: "Tour Taker", tour: true });
    await signInWithPassword(page, me.email, me.password);
    await expect(page).toHaveURL(/\/feed/);

    // Every nav item carries its one-line description for assistive tech.
    for (const key of ["home", "opportunities", "ventures", "chat", "me", "explore", "leaderboard", "notifications", "feedback"]) {
      await expect(page.getByTestId(`nav-${key}`)).toHaveAttribute("aria-describedby", /.+/);
    }
    await page.getByTestId("nav-opportunities").hover();
    await expect(page.getByRole("tooltip")).toContainText("matched to your skills");

    // The tour starts by itself, and runs from the keyboard alone.
    const popover = page.getByTestId("tour-popover");
    await expect(popover).toBeVisible();
    await expect(page.getByTestId("tour-progress")).toHaveText("Step 1 of 9");
    await expect(page.getByTestId("tour-next")).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=tour-popover]"))).toBe(true);
    await page.getByTestId("tour-next").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("tour-progress")).toHaveText("Step 2 of 9");
    await expect(popover).toContainText("Opportunities");
    await page.getByTestId("tour-back").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("tour-progress")).toHaveText("Step 1 of 9");
    for (let i = 0; i < 9; i++) {
      await page.getByTestId("tour-next").focus();
      await page.keyboard.press("Enter");
    }
    await expect(popover).toHaveCount(0);
    const db = adminClient();
    await expect.poll(async () => (await db.from("tour_progress").select("completed_at").eq("user_id", me.id).single()).data?.completed_at ?? null).not.toBeNull();
    // Finished: it doesn't start again.
    await page.reload();
    await expect(page.getByTestId("progress-card")).toBeVisible();
    await expect(popover).toHaveCount(0);

    // Replay from Settings, leave with Escape; it stays skipped-or-done and can be replayed again.
    await page.goto("/settings");
    await page.getByTestId("replay-tour").click();
    await expect(page).toHaveURL(/\/feed/);
    await expect(page.getByTestId("tour-progress")).toHaveText("Step 1 of 9");
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
    await expect.poll(async () => (await db.from("tour_progress").select("skipped_at").eq("user_id", me.id).single()).data?.skipped_at ?? null).not.toBeNull();

    // The progress card: a new student is asked to join a venture; it hides for the day.
    const card = page.getByTestId("progress-card");
    await expect(card.getByTestId("next-step")).toContainText("Join or start a venture");
    await expect(card.getByTestId("checklist")).toContainText("Getting started: 0 of 6");
    await axe(page, "home");
    await page.getByTestId("progress-dismiss").click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(card).toHaveCount(0);

    // First-visit tips: shown once, dismissed for good.
    await page.goto("/opportunities/for_you");
    const tip = page.getByTestId("tip-opportunities");
    await expect(tip).toBeVisible();
    await tip.getByRole("button", { name: "Show me more" }).click();
    await expect(tip).toContainText("Sponsored roles are marked on the Jobs tab only");
    await tip.getByRole("button", { name: /Dismiss/ }).click();
    await expect(tip).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("tip-opportunities")).toHaveCount(0);

    // The hub: seven tabs, each with a teaching empty state; "For you" never shows sponsorship.
    await expect(page.getByRole("heading", { name: "Nothing matched yet" })).toBeVisible();
    await axe(page, "opportunities");
    for (const tab of ["jobs", "contact_requests", "applications", "competitions", "job_fairs", "ideas"]) {
      await page.goto(`/opportunities/${tab}`);
      await expect(page.getByRole("main").getByRole("heading", { level: 3 })).toBeVisible();
    }
    await page.goto("/opportunities/bogus");
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();

    // Me pages.
    for (const [path, heading] of [
      ["/me", me.fullName],
      ["/me/skills", "Your skills"],
      ["/me/work", "My work"],
      ["/settings/privacy", "Privacy"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await axe(page, path);
    }
    await page.goto("/me/skills");
    await expect(page.getByTestId("github-reminder")).toBeVisible();
    await page.goto("/me/work?tab=endorsements");
    await expect(page.getByRole("heading", { name: "No endorsements yet" })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("the phone shell: five tabs, a top bar and a shorter tour", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "phone only");
    test.setTimeout(90_000);
    const me = await createStudent({ domain: "nutech.edu.pk", fullName: "Phone Tabs", tour: true });
    await signInWithPassword(page, me.email, me.password);
    await expect(page.getByTestId("tour-progress")).toHaveText(/Step 1 of 8/);
    await page.getByTestId("tour-skip").click();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveCount(5);
    await page.getByTestId("tab-me").click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("link", { name: "Feedback", exact: false }).first()).toBeVisible();
    await axe(page, "me (phone)");
  });

  test("feedback: send, follow its status, read the reply", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once, on desktop");
    test.setTimeout(90_000);
    const me = await createStudent({ domain: "nutech.edu.pk", fullName: "Fiona Feedback" });
    await signInWithPassword(page, me.email, me.password);
    await page.goto("/feedback");
    await expect(page.getByRole("heading", { name: "You haven't sent any feedback yet" })).toBeVisible();
    await page.getByLabel("What happened, or what would help?").fill("What does Momentum mean on my score page?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const list = page.getByTestId("my-feedback");
    await expect(list).toContainText("What does Momentum mean");
    await expect(list).toContainText("Received");
    await axe(page, "feedback");
    const db = adminClient();
    await db.from("feedback").update({ status: "planned", staff_reply: "We'll explain Momentum on the score page." }).eq("user_id", me.id);
    await page.reload();
    await expect(list).toContainText("Planned");
    await expect(list).toContainText("We'll explain Momentum on the score page.");
  });

  test("a graduate posts to the Global Feed only", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once, on desktop");
    test.setTimeout(90_000);
    const grad = await createStudent({ domain: "nutech.edu.pk", fullName: "Gul Graduate" });
    const db = adminClient();
    await db.from("profiles").update({ status: "graduate", graduated_at: new Date().toISOString() }).eq("user_id", grad.id);
    const api = await apiAs(grad);
    const refused = await api.rpc("create_post", { p: { audience: "university", type: "general", body: "hello campus" } });
    expect(refused.error?.code).toBe("42501");
    const allowed = await api.rpc("create_post", { p: { audience: "global", type: "general", body: "hello world" } });
    expect(allowed.error).toBeNull();
    await signInWithPassword(page, grad.email, grad.password);
    await page.goto("/feed");
    await expect(page.getByRole("radio", { name: "University" })).toBeDisabled();
    await expect(page.getByRole("radio", { name: "Global" })).toBeChecked();
  });

  test("deleting an account: cooling-off, locked to one page, cancel restores it", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once, on desktop");
    test.setTimeout(90_000);
    const me = await createStudent({ domain: "nutech.edu.pk", fullName: "Dana Delete" });
    await signInWithPassword(page, me.email, me.password);
    await page.goto("/settings/account/delete");
    await axe(page, "delete account");
    const submit = page.getByTestId("delete-submit");
    await expect(submit).toBeDisabled();
    await page.getByTestId("delete-confirm").fill(me.username);
    await submit.click();
    await expect(page.getByTestId("deletion-pending")).toBeVisible();
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/settings\/account\/delete$/);
    const db = adminClient();
    expect((await db.from("profiles").select("status").eq("user_id", me.id).single()).data?.status).toBe("deleting");
    await page.getByTestId("delete-cancel").click();
    await expect(page).toHaveURL(/\/feed/);
    const { data } = await db.from("profiles").select("status, delete_after").eq("user_id", me.id).single();
    expect(data).toEqual({ status: "active", delete_after: null });
    await expect(page.getByTestId("nav-home")).toBeVisible();
  });
});
