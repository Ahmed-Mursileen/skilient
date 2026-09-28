import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createStudent, hasBackend, signInWithPassword, watchConsole } from "./support";

/**
 * Phase 3 slice 4 (PRD 5.28): comments with one level of replies, @mentions that notify,
 * pin by the post author, delete leaving a placeholder; "Not for me" and Mute with Undo,
 * and muted people listed under Friends → Blocked.
 */
test.describe("Comments, hide and mute", () => {
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

  test("comment, mention, reply, pin, delete; hide and mute with undo", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const author = await createStudent({ domain: "nutech.edu.pk", fullName: "Asma Author" });
    const commenter = await createStudent({ domain: "nutech.edu.pk", fullName: "Bilal Commenter" });
    const mentioned = await createStudent({ domain: "nutech.edu.pk", fullName: "Chand Mentioned" });
    const text = `Who is going to the career fair ${Date.now().toString(36)}?`;

    await signInWithPassword(page, author.email, author.password);
    await page.goto("/feed");
    await page.getByTestId("composer").getByLabel("What's on your mind?").fill(text);
    await page.getByTestId("composer").getByRole("button", { name: "Post", exact: true }).click();
    const card = page.getByTestId("post").filter({ hasText: text });
    await expect(card.getByRole("link", { name: "Comment" })).toBeVisible();
    const postPath = new URL(await card.getByRole("link", { name: "Comment" }).getAttribute("href") as string, "http://x").pathname;

    // B comments and mentions C.
    const bPage = await (await browser.newContext()).newPage();
    await signInWithPassword(bPage, commenter.email, commenter.password);
    await bPage.goto(postPath);
    await expect(bPage.getByText("No comments yet.")).toBeVisible();
    await axe(bPage, "post page (no comments)");
    await bPage.getByLabel("Add a comment").fill(`Me! @${mentioned.username} are you coming?`);
    await bPage.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(bPage.getByTestId("comment")).toHaveCount(1);
    await expect(bPage.getByRole("heading", { name: "1 comment" })).toBeVisible();
    // 10 seconds between comments.
    await bPage.getByLabel("Add a comment").fill("And another thing");
    await bPage.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(bPage.getByRole("main").getByRole("alert")).toContainText("Wait 10 seconds between comments.");

    // C is notified of the mention; A of the comment.
    const cPage = await (await browser.newContext()).newPage();
    await signInWithPassword(cPage, mentioned.email, mentioned.password);
    await cPage.goto("/notifications");
    await expect(cPage.getByTestId("notification").first()).toContainText(`${commenter.fullName} mentioned you in a comment`);
    await page.goto("/notifications");
    await expect(page.getByTestId("notification").first()).toContainText(`${commenter.fullName} commented on your post`);

    // A replies to B (one level only), then pins B's comment.
    await page.goto(postPath);
    const bComment = page.getByTestId("comment").filter({ hasText: "are you coming?" });
    await bComment.getByRole("button", { name: "Reply" }).click();
    await page.getByLabel(`Reply to ${commenter.fullName}`).fill("See you there.");
    await page.getByRole("button", { name: "Reply", exact: true }).last().click();
    const reply = page.getByTestId("comment").filter({ hasText: "See you there." });
    await expect(reply).toBeVisible();
    await expect(reply.getByRole("button", { name: "Reply" })).toHaveCount(0);
    await bComment.getByRole("button", { name: "Pin" }).click();
    await expect(page.getByText("Pinned by the author")).toBeVisible();
    await axe(page, "post page (comments)");

    // B deletes her comment: it stays as a placeholder so the reply keeps its context.
    await bPage.reload();
    await bPage.getByTestId("comment").filter({ hasText: "are you coming?" }).getByRole("button", { name: "Delete" }).click();
    await expect(bPage.getByTestId("comment-deleted")).toBeVisible();
    await expect(bPage.getByTestId("comment").filter({ hasText: "See you there." })).toBeVisible();

    // "Not for me" folds the card with Undo.
    await bPage.goto("/feed");
    const bCard = bPage.getByTestId("post").filter({ hasText: text });
    await bCard.getByRole("button", { name: "Not for me" }).click();
    await expect(bPage.getByText("Hidden. You'll see fewer posts like this.")).toBeVisible();
    await bPage.getByRole("button", { name: "Undo" }).click();
    await expect(bPage.getByTestId("post").filter({ hasText: text })).toBeVisible();

    // Mute takes A's posts out of B's feed, and is undone from Friends → Blocked.
    await bPage.getByTestId("post").filter({ hasText: text }).getByRole("button", { name: "Mute Asma" }).click();
    await expect(bPage.getByText(`You muted ${author.fullName}.`)).toBeVisible();
    await bPage.reload();
    await expect(bPage.getByTestId("post").filter({ hasText: text })).toHaveCount(0);
    await bPage.goto("/friends?tab=blocked");
    await expect(bPage.getByTestId("muted-row")).toContainText(author.fullName);
    await axe(bPage, "friends blocked + muted");
    await bPage.getByRole("button", { name: `Unmute ${author.fullName}` }).click();
    await expect(bPage.getByTestId("muted-row")).toHaveCount(0);
    await bPage.goto("/feed");
    await expect(bPage.getByTestId("post").filter({ hasText: text })).toBeVisible();

    expect(problems).toEqual([]);
  });
});
