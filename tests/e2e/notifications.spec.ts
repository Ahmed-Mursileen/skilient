import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { createStudent, hasBackend, signInWithPassword, watchConsole } from "./support";

/**
 * Phase 3 slice 2 (PRD 5.11): a friend request lights the receiver's bell live; opening
 * the notification marks it read and lands on the request; the sender hears about the
 * accept; mark all read; email settings per category (no instant email for team news);
 * nobody can write a notification through the API.
 */
test.describe("Notifications", () => {
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

  test("bell, list, open to mark read, mark all read", async ({ page, browser }) => {
    test.setTimeout(150_000);
    const problems = watchConsole(page);
    const sender = await createStudent({ domain: "nutech.edu.pk", fullName: "Nadia Notifier" });
    const receiver = await createStudent({ domain: "nu.edu.pk", fullName: "Rashid Receiver" });

    const receiverPage = await (await browser.newContext()).newPage();
    await signInWithPassword(receiverPage, receiver.email, receiver.password);
    await receiverPage.goto("/notifications");
    await expect(receiverPage.getByText("You're all caught up")).toBeVisible();
    await axe(receiverPage, "notifications (empty)");
    await expect(receiverPage.getByTestId("notification-count")).toHaveCount(0);

    await signInWithPassword(page, sender.email, sender.password);
    await page.goto("/friends");
    await page.getByLabel("Add a friend by username").fill(receiver.username);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText(`Request sent to @${receiver.username}.`)).toBeVisible();

    // Live: the bell counts it without a reload.
    await expect(receiverPage.getByTestId("notification-count")).toHaveText("1", { timeout: 15_000 });
    await expect(receiverPage.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible();
    await receiverPage.reload();
    const item = receiverPage.getByTestId("notification").first();
    await expect(item).toContainText(`${sender.fullName} sent you a friend request.`);
    await expect(item).toHaveAttribute("data-read", "false");
    await expect(receiverPage.getByRole("heading", { name: "Today" })).toBeVisible();
    await axe(receiverPage, "notifications (unread)");

    await item.getByRole("link").click();
    await expect(receiverPage).toHaveURL(/\/friends\?tab=received$/);
    await expect(receiverPage.getByTestId("notification-count")).toHaveCount(0);
    await receiverPage.getByRole("button", { name: `Accept ${sender.fullName}'s request` }).click();
    await expect(receiverPage.getByText("No requests waiting")).toBeVisible();

    // The sender hears about the accept; mark all read clears it.
    await expect(page.getByTestId("notification-count")).toHaveText("1", { timeout: 15_000 });
    await page.goto("/notifications");
    await expect(page.getByTestId("notification").first()).toContainText(`${receiver.fullName} accepted your friend request.`);
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByTestId("notification").first()).toHaveAttribute("data-read", "true");
    await expect(page.getByTestId("notification-count")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(0);

    expect(problems).toEqual([]);
  });

  test("email settings per category; direct writes refused", async ({ page }) => {
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Sadia Settings" });
    await signInWithPassword(page, student.email, student.password);
    await page.goto("/settings");
    await page.getByRole("main").getByRole("link", { name: /Notifications/ }).click();
    await expect(page).toHaveURL(/\/settings\/notifications$/);
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();

    const friends = page.getByTestId("pref-friend_requests");
    await expect(friends.getByRole("radio", { name: "Instant email" })).toBeChecked();
    const team = page.getByTestId("pref-team");
    await expect(team.getByRole("radio", { name: "Off" })).toBeChecked();
    await expect(team.getByRole("radio", { name: "Instant email" })).toHaveCount(0);
    await axe(page, "notification settings");

    await friends.getByText("Daily digest").click();
    await expect(friends.getByRole("status")).toContainText("Saved: daily digest for friend requests.");
    await page.reload();
    await expect(page.getByTestId("pref-friend_requests").getByRole("radio", { name: "Daily digest" })).toBeChecked();

    // Keyboard: arrows move between choices and save.
    await page.getByTestId("pref-team").getByRole("radio", { name: "Off" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("pref-team").getByRole("status")).toContainText("Saved: daily digest for your teams.");

    const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const api = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    await api.auth.signInWithPassword({ email: student.email, password: student.password });
    const insert = await api.from("notifications").insert({ user_id: student.id, type: "friend_request", entity_type: "x", entity_id: student.id });
    expect(insert.error?.code).toBe("42501");
    const pref = await api.rpc("set_notification_pref", { p_category: "team", p_channel: "instant_email" });
    expect(pref.error?.code).toBe("22023");
  });
});
