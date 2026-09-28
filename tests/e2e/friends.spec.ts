import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole } from "./support";

/**
 * Phase 3 slice 1 (PRD 5.8, 5.4): send a request by username, the receiver's badge updates
 * live, accept, and the friend reads a friends-only profile that classmates can't. Blocking
 * hides both people from each other and is undone from the Blocked tab. Direct API writes
 * to the friend tables are refused.
 */
test.describe("Friends and blocks", () => {
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

  test("request, live badge, accept, friends-only profile, unfriend", async ({ page, browser }) => {
    test.setTimeout(150_000);
    const problems = watchConsole(page);
    const asker = await createStudent({ domain: "nutech.edu.pk", fullName: "Fatima Friend" });
    const other = await createStudent({ domain: "nu.edu.pk", fullName: "Farhan Faraway" });
    const classmate = await createStudent({ domain: "nu.edu.pk", fullName: "Kiran Classmate" });
    await adminClient().from("profiles").update({ visibility: "friends" }).eq("user_id", other.id);

    // The receiver is already on a page when the request arrives.
    const otherPage = await (await browser.newContext()).newPage();
    await signInWithPassword(otherPage, other.email, other.password);
    await otherPage.goto("/friends");
    await expect(otherPage.getByRole("heading", { level: 1, name: "Friends" })).toBeVisible();
    await expect(otherPage.getByText("No friends yet")).toBeVisible();
    await axe(otherPage, "friends (empty)");
    await expect(otherPage.getByTestId("friends-badge")).toHaveCount(0);

    await signInWithPassword(page, asker.email, asker.password);
    await page.goto("/friends");
    await page.getByLabel("Add a friend by username").fill(`@${other.username}`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText(`Request sent to @${other.username}.`)).toBeVisible();
    await page.getByLabel("Add a friend by username").fill(other.username);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("link", { name: /^Sent/ }).click();
    await expect(page.getByTestId("friend-row")).toHaveAttribute("data-username", other.username);
    await axe(page, "friends sent");

    // Realtime: the badge appears without a reload.
    await expect(otherPage.getByTestId("friends-badge")).toContainText("1", { timeout: 15_000 });
    await otherPage.getByRole("link", { name: /^Received/ }).click();
    await expect(otherPage.getByTestId("friend-row")).toContainText(asker.fullName);
    await axe(otherPage, "friends received");
    await otherPage.getByRole("button", { name: `Accept ${asker.fullName}'s request` }).click();
    await expect(otherPage.getByText("No requests waiting")).toBeVisible();
    await otherPage.goto("/friends");
    await expect(otherPage.getByTestId("friend-row")).toHaveAttribute("data-username", asker.username);
    await expect(otherPage.getByTestId("friends-badge")).toHaveCount(0);

    // A friend reads the friends-only profile in full; a stranger gets the card.
    await page.goto(`/profile/${other.username}`);
    await expect(page.getByRole("heading", { level: 1, name: other.fullName })).toBeVisible();
    await expect(page.getByTestId("restricted-card")).toHaveCount(0);
    await expect(page.getByTestId("friend-actions")).toContainText("Friends");
    await axe(page, "profile (friend)");

    const classmatePage = await (await browser.newContext()).newPage();
    await signInWithPassword(classmatePage, classmate.email, classmate.password);
    await classmatePage.goto(`/profile/${other.username}`);
    await expect(classmatePage.getByTestId("restricted-card")).toBeVisible();
    await expect(classmatePage.getByRole("button", { name: "Add friend" })).toBeVisible();

    // Unfriend from the profile: back to strangers, the profile closes again.
    await page.getByRole("button", { name: "Unfriend" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Unfriend" }).click();
    await expect(page.getByTestId("restricted-card")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add friend" })).toBeVisible();

    expect(problems).toEqual([]);
  });

  test("block hides both ways; unblock from the Blocked tab; direct writes refused", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const blocker = await createStudent({ domain: "nutech.edu.pk", fullName: "Bushra Blocker" });
    const blocked = await createStudent({ domain: "nutech.edu.pk", fullName: "Bashir Blocked" });

    await signInWithPassword(page, blocker.email, blocker.password);
    await page.goto(`/profile/${blocked.username}`);
    await expect(page.getByRole("heading", { level: 1, name: blocked.fullName })).toBeVisible();
    await page.getByRole("button", { name: "Block" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("isn't told");
    await axe(page, "block dialog");
    await dialog.getByRole("button", { name: "Block" }).click();
    await expect(page).toHaveURL(/\/friends\?tab=blocked$/);
    await expect(page.getByTestId("blocked-row")).toContainText(blocked.fullName);
    await axe(page, "friends blocked");

    const blockedPage = await (await browser.newContext()).newPage();
    await signInWithPassword(blockedPage, blocked.email, blocked.password);
    await blockedPage.goto(`/profile/${blocker.username}`);
    await expect(blockedPage.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    await page.goto(`/profile/${blocked.username}`);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();

    // The blocked person can't find a way round it through the API either.
    const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const api = createClient(url, key, { auth: { persistSession: false } });
    await api.auth.signInWithPassword({ email: blocked.email, password: blocked.password });
    const send = await api.rpc("send_friend_request", { p_username: blocker.username });
    expect(send.error?.code).toBe("P0002");
    const blocks = await api.from("blocks").select("*");
    expect(blocks.data).toEqual([]);
    const insert = await api.from("friendships").insert({ user_id_a: blocked.id, user_id_b: blocker.id });
    expect(insert.error?.code).toBe("42501");
    const removeBlock = await api.from("blocks").delete().eq("blocker_id", blocker.id).select();
    expect(removeBlock.data ?? []).toEqual([]);

    // Unblock: both see each other again.
    await page.goto("/friends?tab=blocked");
    await page.getByRole("button", { name: `Unblock ${blocked.fullName}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Unblock" }).click();
    await expect(page.getByText("You haven't blocked anyone")).toBeVisible();
    await blockedPage.goto(`/profile/${blocker.username}`);
    await expect(blockedPage.getByRole("heading", { level: 1, name: blocker.fullName })).toBeVisible();
  });
});
