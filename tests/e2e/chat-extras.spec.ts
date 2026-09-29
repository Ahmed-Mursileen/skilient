import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 3 slice 8 (PRD 5.28 "Chat"): typing shows on the other side; a reply quotes its
 * message; a reaction reaches the other side live; "Seen" appears in a DM while both have
 * read receipts on and disappears for good once one turns them off; search finds messages
 * across chats and within a thread; the venture owner pins a message the team sees.
 */
test.describe("Chat extras", () => {
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

  // Match on the message's own text, not a reply's quote of it.
  const message = (page: Page, text: string) => page.getByTestId("message").filter({ has: page.locator("p", { hasText: text }) });

  test("typing, reply, reactions, read receipts, search, pins", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const tag = Date.now().toString(36);
    const a = await createStudent({ domain: "nutech.edu.pk", fullName: "Asma Extras" });
    const b = await createStudent({ domain: "nutech.edu.pk", fullName: "Bilal Extras" });
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await adminClient().from("friendships").insert({ user_id_a: x, user_id_b: y });
    const { data: threadId } = await (await apiAs(a)).rpc("get_or_create_dm", { p_username: b.username });
    const threadUrl = `/chat/${threadId}`;

    await signInWithPassword(page, a.email, a.password);
    await page.goto(threadUrl);
    const bPage = await (await browser.newContext()).newPage();
    await signInWithPassword(bPage, b.email, b.password);
    await bPage.goto(threadUrl);
    await expect(bPage.getByRole("heading", { name: a.fullName })).toBeVisible();

    // Typing shows on the other side (members-only broadcast channel).
    await expect(async () => {
      await page.getByLabel("Message", { exact: true }).pressSequentially("R", { delay: 20 });
      await expect(bPage.getByTestId("typing")).toHaveText("Asma is typing…", { timeout: 1_500 });
    }).toPass({ timeout: 15_000, intervals: [3_100] });
    await page.getByLabel("Message", { exact: true }).fill(`Robotics kit ${tag} arrives Monday`);
    await page.keyboard.press("Enter");
    await expect(message(bPage, `Robotics kit ${tag}`)).toBeVisible({ timeout: 10_000 });
    await expect(bPage.getByTestId("typing")).toHaveText("");

    // B replies to it; the quote shows on both sides.
    await message(bPage, `Robotics kit ${tag}`).getByRole("button", { name: "Reply" }).click();
    await expect(bPage.getByTestId("replying-to")).toContainText(`Robotics kit ${tag}`);
    await bPage.getByLabel("Message", { exact: true }).fill("Great, I'll bring the soldering iron");
    await bPage.keyboard.press("Enter");
    const replyOnA = message(page, "soldering iron");
    await expect(replyOnA.getByTestId("reply-quote")).toContainText(`Robotics kit ${tag}`, { timeout: 10_000 });
    await expect(replyOnA.getByTestId("reply-quote")).toContainText("You");
    await expect(message(bPage, "soldering iron").getByTestId("reply-quote")).toContainText(a.fullName);

    // B reacts; A sees it live and adds the same one.
    await message(bPage, `Robotics kit ${tag}`).getByRole("button", { name: "React" }).click();
    await bPage.getByRole("button", { name: "React 🎉" }).click();
    const onA = message(page, `Robotics kit ${tag}`).getByTestId("reactions");
    await expect(onA.getByRole("button", { name: "🎉 1" })).toBeVisible({ timeout: 10_000 });
    await onA.getByRole("button", { name: "🎉 1" }).click();
    await expect(onA.getByRole("button", { name: "🎉 2, including you" })).toHaveAttribute("aria-pressed", "true");
    await expect(message(bPage, `Robotics kit ${tag}`).getByRole("button", { name: "🎉 2, including you" })).toBeVisible({ timeout: 10_000 });

    // Read receipts: B has the thread open, so A's newest message shows "Seen".
    await page.getByLabel("Message", { exact: true }).fill("See you then");
    await page.keyboard.press("Enter");
    await expect(message(page, "See you then").getByTestId("seen")).toBeVisible({ timeout: 10_000 });
    await axe(page, "chat thread (extras)");

    // B turns receipts off: neither side sees them any more.
    await bPage.goto("/settings/chat");
    await axe(bPage, "chat settings");
    const toggle = bPage.getByRole("switch", { name: "Read receipts" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(bPage.getByRole("status")).toHaveText("Saved.");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await bPage.goto(threadUrl);
    await expect(message(bPage, "See you then")).toBeVisible();
    await page.reload();
    await expect(message(page, "See you then")).toBeVisible();
    await expect(page.getByTestId("seen")).toHaveCount(0);
    await bPage.getByLabel("Message", { exact: true }).fill("One more thing");
    await bPage.keyboard.press("Enter");
    await expect(message(page, "One more thing")).toBeVisible({ timeout: 10_000 });
    await expect(bPage.getByTestId("seen")).toHaveCount(0);

    // Search across chats, then within the thread.
    await page.goto("/chat");
    await page.getByRole("searchbox", { name: "Search messages" }).fill("robotic");
    const hit = page.getByTestId("chat-search-results").getByRole("link").filter({ hasText: `Robotics kit ${tag}` });
    await expect(hit).toContainText(b.fullName);
    await hit.click();
    await expect(page).toHaveURL(new RegExp(`${threadUrl}#m-`));
    await expect(message(page, `Robotics kit ${tag}`)).toBeInViewport();
    await page.getByRole("button", { name: "Search this chat" }).click();
    await page.getByRole("searchbox", { name: "Search this chat" }).fill("solder");
    await expect(page.getByTestId("thread-search-results")).toContainText("soldering iron");
    await page.getByRole("searchbox", { name: "Search this chat" }).fill("zzqx");
    await expect(page.getByText("No messages match.")).toBeVisible();

    // Pins: the venture owner pins a team message; the team sees it; members can't pin.
    const aApi = await apiAs(a);
    const { data: ventureId } = await aApi.rpc("create_venture", { p: { type: "project", title: `Pin test ${tag}`, description: "d" } });
    const bApi = await apiAs(b);
    const { data: app } = await bApi.rpc("apply_to_venture", { p_venture: ventureId, p_message: "In" });
    await aApi.rpc("decide_application", { p_thread: app, p_accept: true });
    const { data: groupId } = await aApi.rpc("venture_chat", { p_venture: ventureId });
    await aApi.rpc("send_message", { p_thread: groupId, p_body: "Demo day is 14 March" });
    await page.goto(`/chat/${groupId}`);
    await bPage.goto(`/chat/${groupId}`);
    await expect(message(bPage, "Demo day")).toBeVisible();
    await expect(message(bPage, "Demo day").getByRole("button", { name: "Pin" })).toHaveCount(0);
    await message(page, "Demo day").getByRole("button", { name: "Pin" }).click();
    await expect(page.getByTestId("pins")).toContainText("Demo day is 14 March");
    await expect(bPage.getByTestId("pins")).toContainText("Demo day is 14 March", { timeout: 10_000 });
    await expect(message(bPage, "Demo day")).toContainText("pinned");
    await axe(bPage, "team chat with a pin");

    expect(problems).toEqual([]);
  });
});
