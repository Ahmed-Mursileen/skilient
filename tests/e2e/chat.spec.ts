import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 3 slice 7 (PRD 5.9, 5.28): friends open a DM from the profile; messages arrive
 * live both ways; an image, an edit and a delete reach the other side; the header shows
 * unread; a non-member can't read, join or post through the API or the page; the venture
 * Chat tab opens the team's group chat for members.
 */
test.describe("Chat", () => {
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

  test("DM live both ways, image, edit, delete, unread; outsiders refused; venture group chat", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const a = await createStudent({ domain: "nutech.edu.pk", fullName: "Amir Chatter" });
    const b = await createStudent({ domain: "nutech.edu.pk", fullName: "Bina Chatter" });
    const outsider = await createStudent({ domain: "nutech.edu.pk", fullName: "Cyrus Outsider" });
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await adminClient().from("friendships").insert({ user_id_a: x, user_id_b: y });

    // A opens the DM from B's profile.
    await signInWithPassword(page, a.email, a.password);
    await page.goto(`/profile/${b.username}`);
    await page.getByRole("button", { name: "Message" }).click();
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
    const threadUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: b.fullName })).toBeVisible();
    await expect(page.getByText("No messages yet. Say hello.")).toBeVisible();
    await axe(page, "chat thread (empty)");

    // B has the same thread open; A's message arrives live.
    const bPage = await (await browser.newContext()).newPage();
    await signInWithPassword(bPage, b.email, b.password);
    await bPage.goto(threadUrl);
    await expect(bPage.getByRole("heading", { name: a.fullName })).toBeVisible();
    await page.getByLabel("Message", { exact: true }).fill("Hi Bina, free to plan the app?");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("message").filter({ hasText: "Hi Bina" })).toHaveAttribute("data-status", "sent");
    await expect(bPage.getByTestId("message").filter({ hasText: "Hi Bina, free to plan the app?" })).toBeVisible({ timeout: 10_000 });

    // B replies; it reaches A live.
    await bPage.getByLabel("Message", { exact: true }).fill("Yes! After class?");
    await bPage.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("message").filter({ hasText: "Yes! After class?" })).toBeVisible({ timeout: 10_000 });

    // An image, then an edit and a delete, all seen by B.
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#0e0d0b" } }).png().toBuffer();
    await page.getByTestId("chat-image").setInputFiles({ name: "sketch.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("button", { name: "Remove image" })).toBeVisible();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(bPage.getByTestId("message").locator("img")).toHaveCount(1, { timeout: 10_000 });
    const mine = page.getByTestId("message").filter({ hasText: "Hi Bina" });
    await mine.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Edit message").fill("Hi Bina, free to plan the campus app?");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(bPage.getByTestId("message").filter({ hasText: "campus app" })).toContainText("edited", { timeout: 10_000 });
    await page.getByTestId("message").filter({ hasText: "campus app" }).getByRole("button", { name: "Delete" }).click();
    await expect(bPage.getByText("Message deleted")).toBeVisible({ timeout: 10_000 });
    await axe(page, "chat thread (messages)");

    // Unread: B leaves; A writes; B's header shows it and the list counts it.
    await bPage.goto("/feed");
    await page.getByLabel("Message", { exact: true }).fill("See you at 4");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("message").filter({ hasText: "See you at 4" })).toHaveAttribute("data-status", "sent");
    await expect(bPage.getByTestId("chat-badge")).toHaveText(/1/, { timeout: 15_000 });
    await bPage.goto("/chat");
    await expect(bPage.getByTestId("thread-row").filter({ hasText: a.fullName }).getByTestId("thread-unread")).toHaveText(/1/);
    await axe(bPage, "chat list");
    await bPage.getByTestId("thread-row").filter({ hasText: a.fullName }).click();
    await expect(bPage.getByTestId("message").filter({ hasText: "See you at 4" })).toBeVisible();
    await expect(bPage.getByTestId("thread-row").filter({ hasText: a.fullName }).getByTestId("thread-unread")).toHaveCount(0);
    // Opening it marked it read (the write lands just after the page shows).
    await expect(async () => {
      await bPage.goto("/chat");
      await expect(bPage.getByTestId("thread-row").filter({ hasText: a.fullName }).getByTestId("thread-unread")).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });

    // A non-member can't read, join or post, through the API or the page.
    const threadId = threadUrl.split("/").pop()!;
    const api = await apiAs(outsider);
    expect((await api.from("chat_messages").select("id").eq("thread_id", threadId)).data).toEqual([]);
    expect((await api.from("chat_threads").select("id").eq("id", threadId)).data).toEqual([]);
    expect((await api.from("chat_thread_members").insert({ thread_id: threadId, user_id: outsider.id })).error?.code).toBe("42501");
    expect((await api.rpc("send_message", { p_thread: threadId, p_body: "let me in" })).error?.code).toBe("42501");
    expect((await api.rpc("get_or_create_dm", { p_username: a.username })).error?.code).toBe("42501");
    const cPage = await (await browser.newContext()).newPage();
    await signInWithPassword(cPage, outsider.email, outsider.password);
    await cPage.goto(threadUrl);
    await expect(cPage.getByText("This chat isn't available")).toBeVisible();

    // The venture Chat tab takes members to the group chat.
    const aApi = await apiAs(a);
    const { data: ventureId } = await aApi.rpc("create_venture", { p: { type: "project", title: `Chat venture ${Date.now().toString(36)}`, description: "d" } });
    const bApi = await apiAs(b);
    const { data: app } = await bApi.rpc("apply_to_venture", { p_venture: ventureId, p_message: "Count me in" });
    await aApi.rpc("decide_application", { p_thread: app, p_accept: true });
    await bPage.goto(`/ventures/${ventureId}`);
    await bPage.getByRole("navigation", { name: "Venture sections" }).getByRole("link", { name: "Chat" }).click();
    await expect(bPage).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
    await bPage.getByLabel("Message", { exact: true }).fill("Hello team");
    await bPage.keyboard.press("Enter");
    // Wait until it's stored (the optimistic "sending" mark clears) before A opens the thread.
    const sent = bPage.getByTestId("message").filter({ hasText: "Hello team" });
    await expect(sent).toBeVisible();
    await expect(sent.getByText("· sending")).toHaveCount(0);
    await page.goto(new URL(bPage.url()).pathname);
    await expect(page.getByTestId("message").filter({ hasText: "Hello team" })).toBeVisible();
    await cPage.goto(`/ventures/${ventureId}/chat`);
    await expect(cPage.getByText("The team's chat is for members")).toBeVisible();

    expect(problems).toEqual([]);
  });
});
