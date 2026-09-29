import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 3 slice 9 (PRD 5.12, 5.26): a reader reports a post and hears only "thanks";
 * a chat message is reported with an earlier message attached; a moderator with
 * two-factor sees both cases in /ops with only the attached messages, claims, removes
 * one and warns on the other; the owner is told and the removed message is gone;
 * every decision is in the audit log; students can't open /ops.
 */
test.describe("Reports and /ops", () => {
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

  test("report a post and a message; a moderator removes and warns", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const tag = Date.now().toString(36);
    const author = await createStudent({ domain: "nutech.edu.pk", fullName: "Rashid Reported" });
    const reader = await createStudent({ domain: "nutech.edu.pk", fullName: "Rabia Reader" });
    const friend = await createStudent({ domain: "nutech.edu.pk", fullName: "Farid Friend" });
    const mod = await createStudent({ domain: "nutech.edu.pk", fullName: "Maryam Moderator" });
    const db = adminClient();
    const [x, y] = author.id < friend.id ? [author.id, friend.id] : [friend.id, author.id];
    await db.from("friendships").insert({ user_id_a: x, user_id_b: y });
    await db.from("staff_roles").insert({ user_id: mod.id, role: "moderator", granted_by: mod.id });

    const authorApi = await apiAs(author);
    await authorApi.rpc("create_post", { p: { audience: "university", type: "general", body: `Buy exam leaks ${tag}` } });
    const { data: dm } = await authorApi.rpc("get_or_create_dm", { p_username: friend.username });
    await authorApi.rpc("send_message", { p_thread: dm, p_body: `Earlier context ${tag}` });
    await new Promise((r) => setTimeout(r, 50));
    await authorApi.rpc("send_message", { p_thread: dm, p_body: `Rude message ${tag}` });

    // A reader reports the post; only a thank-you comes back.
    await signInWithPassword(page, reader.email, reader.password);
    await page.goto("/feed");
    const card = page.getByTestId("post").filter({ hasText: `Buy exam leaks ${tag}` });
    await card.getByRole("button", { name: "Report" }).click();
    const dialog = page.getByRole("dialog", { name: "Report this post" });
    await dialog.getByRole("radio", { name: "Spam" }).check();
    await dialog.getByLabel("Anything else?").fill("Selling leaked papers");
    await axe(page, "report dialog");
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByRole("dialog")).toContainText("Thanks, we'll review this.");
    await page.getByRole("button", { name: "Close" }).first().click();
    // A second report on the same post is refused politely.
    await card.getByRole("button", { name: "Report" }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Other" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Send report" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("already reported");
    await page.keyboard.press("Escape");
    // Students never see /ops (it needs two-factor first, then a staff role).
    await page.goto("/ops");
    await expect(page).not.toHaveURL(/\/ops$/);

    // The friend reports the rude message, attaching the earlier one.
    const fPage = await (await browser.newContext()).newPage();
    await signInWithPassword(fPage, friend.email, friend.password);
    await fPage.goto(`/chat/${dm}`);
    const rude = fPage.getByTestId("message").filter({ has: fPage.locator("p", { hasText: `Rude message ${tag}` }) });
    await rude.getByRole("button", { name: "Report" }).click();
    const mDialog = fPage.getByRole("dialog", { name: "Report this message" });
    await mDialog.getByRole("radio", { name: "Harassment" }).check();
    await mDialog.getByRole("checkbox", { name: new RegExp(`Earlier context ${tag}`) }).check();
    await mDialog.getByRole("button", { name: "Send report" }).click();
    await expect(fPage.getByRole("dialog")).toContainText("Thanks, we'll review this.");

    // The moderator turns on two-factor, then works the queue.
    const mPage = await (await browser.newContext()).newPage();
    await signInWithPassword(mPage, mod.email, mod.password);
    await mPage.goto("/settings/security");
    await mPage.getByRole("button", { name: "Set up two-factor" }).click();
    const secret = (await mPage.locator("code").first().textContent())?.trim() ?? "";
    await mPage.getByLabel("Code from the app").fill(totp(secret));
    await mPage.getByRole("button", { name: "Confirm" }).click();
    await mPage.getByRole("checkbox", { name: "I've saved these codes" }).check();
    await mPage.getByRole("button", { name: "Done" }).click();
    await mPage.goto("/ops");
    await expect(mPage.getByTestId("staff-marker")).toBeVisible();
    const queue = mPage.getByTestId("ops-queue");
    await expect(queue.getByTestId("ops-case").filter({ hasText: `Rude message ${tag}` })).toBeVisible();
    await expect(queue.getByTestId("ops-case").filter({ hasText: `Buy exam leaks ${tag}` })).toContainText("Spam");
    await axe(mPage, "ops queue");

    // Message case: only the attached messages; claim, then remove.
    await queue.getByTestId("ops-case").filter({ hasText: `Rude message ${tag}` }).getByRole("link", { name: "Chat message" }).click();
    const context = mPage.getByTestId("case-messages");
    await expect(context.getByRole("listitem")).toHaveCount(2);
    await expect(context).toContainText(`Earlier context ${tag}`);
    await expect(mPage.getByTestId("case-reports")).toContainText("Harassment");
    await mPage.getByRole("button", { name: "Claim" }).click();
    await mPage.getByRole("radio", { name: /Remove content/ }).check();
    await mPage.getByLabel("Reason", { exact: true }).fill("Insulting another student");
    await axe(mPage, "ops case (claimed)");
    await mPage.getByRole("button", { name: "Confirm decision" }).click();
    await expect(mPage.getByTestId("case-outcome")).toContainText("Removed by Maryam Moderator");

    // Post case: warn the author.
    await mPage.goto("/ops");
    await mPage.getByTestId("ops-case").filter({ hasText: `Buy exam leaks ${tag}` }).getByRole("link", { name: "Post" }).click();
    await mPage.getByRole("button", { name: "Claim" }).click();
    await mPage.getByRole("radio", { name: /Warn the owner/ }).check();
    await mPage.getByLabel("Reason", { exact: true }).fill("Promoting exam leaks");
    await mPage.getByRole("button", { name: "Confirm decision" }).click();
    await expect(mPage.getByTestId("case-outcome")).toContainText("Owner warned");
    await mPage.goto("/ops?status=resolved");
    await expect(mPage.getByTestId("ops-case").filter({ hasText: `Rude message ${tag}` })).toContainText("Removed");

    // The friend's chat shows the message as deleted; the author hears why.
    await fPage.reload();
    await expect(fPage.getByTestId("message").filter({ hasText: `Rude message ${tag}` })).toHaveCount(0);
    const aPage = await (await browser.newContext()).newPage();
    await signInWithPassword(aPage, author.email, author.password);
    await aPage.goto("/notifications");
    await expect(aPage.getByText("A moderator removed your message for breaking the community guidelines.")).toBeVisible();
    await aPage.getByText("A moderator sent you a warning about your post.").click();
    await expect(aPage.getByRole("heading", { name: "A warning about your post" })).toBeVisible();
    await expect(aPage.getByText("Promoting exam leaks")).toBeVisible();
    await axe(aPage, "moderation notice");

    // Every decision and claim is in the audit log.
    const { data: audit } = await db.from("ops_audit_log").select("action").eq("staff_id", mod.id);
    expect((audit ?? []).map((a) => a.action).sort()).toEqual(["report.claim", "report.claim", "report.remove", "report.warn"]);

    expect(problems).toEqual([]);
  });
});
