import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 3 slice 3 (PRD 5.6, 5.28): posts with images, University vs Global audiences
 * across universities, edit window, delete, polls (one vote, results after voting),
 * events (RSVP), filter chips, the 30 s cooldown, invite posts with Apply, and venture
 * update images. No like, save or share control exists anywhere.
 */
test.describe("Posts", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  async function photo(): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
    const buffer = await sharp({ create: { width: 2600, height: 1800, channels: 3, background: "#c03910" } })
      .jpeg()
      .withExif({ IFD0: { Make: "LeakyCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "33/1 41/1 0/1" } })
      .toBuffer();
    return { name: "campus.jpg", mimeType: "image/jpeg", buffer };
  }

  function apiAs(student: TestStudent) {
    const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const api = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    return api.auth.signInWithPassword({ email: student.email, password: student.password }).then(() => api);
  }

  async function post(page: Page, body: string) {
    const composer = page.getByTestId("composer");
    await composer.getByLabel(/What's on your mind|What's happening|Question/).fill(body);
    await composer.getByRole("button", { name: "Post", exact: true }).click();
  }

  test("audiences, images, edit, delete, cooldown", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const author = await createStudent({ domain: "nutech.edu.pk", fullName: "Parveen Poster" });
    const classmate = await createStudent({ domain: "nutech.edu.pk", fullName: "Kamran Classmate" });
    const outsider = await createStudent({ domain: "nu.edu.pk", fullName: "Omar Outsider" });
    const text = `Robotics club meets Friday ${Date.now().toString(36)}`;

    await signInWithPassword(page, author.email, author.password);
    await page.goto("/feed");
    await expect(page.getByRole("link", { name: "University Feed" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("composer")).toBeVisible();
    await axe(page, "feed (empty)");
    // Nothing to like, save or share (PRD 5.28 done-when).
    await expect(page.getByRole("button", { name: /like|save|share|react/i })).toHaveCount(0);

    // A University post with an image; the draft survives a reload until posted.
    await page.getByTestId("composer").getByLabel("What's on your mind?").fill(text);
    await page.reload();
    await expect(page.getByTestId("composer").getByLabel("What's on your mind?")).toHaveValue(text);
    await page.getByTestId("post-images").setInputFiles(await photo());
    await expect(page.getByRole("list", { name: "Images to post" }).getByRole("listitem")).toHaveCount(1);
    await page.getByTestId("composer").getByRole("button", { name: "Post", exact: true }).click();
    const mine = page.getByTestId("post").filter({ hasText: text });
    await expect(mine).toBeVisible();
    await expect(page.getByTestId("composer").getByLabel("What's on your mind?")).toHaveValue("");
    const img = mine.locator("img").first();
    await expect(img).toHaveAttribute("src", /\/post-media\/.+\.webp$/);
    // The stored image is the server's re-encode: 2,000 px wide at most, no EXIF.
    const stored = await (await fetch(await img.getAttribute("src") as string)).arrayBuffer();
    const meta = await sharp(Buffer.from(stored)).metadata();
    expect(meta.width).toBeLessThanOrEqual(2000);
    expect(meta.exif).toBeUndefined();
    expect(Buffer.from(stored).toString("latin1")).not.toContain("LeakyCam");
    await axe(page, "feed (post)");

    // Cooldown: a second post straight away is refused.
    await post(page, "Too fast");
    await expect(page.getByTestId("composer").getByRole("alert")).toContainText("Wait 30 seconds between posts.");

    // Edit within 15 minutes shows "edited".
    await mine.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByLabel("Post").fill(`${text} (Lab 3)`);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("post").filter({ hasText: `${text} (Lab 3)` })).toContainText("edited");
    const postId = await page.getByTestId("post").filter({ hasText: text }).getAttribute("data-post-id");

    // A classmate sees it; another university doesn't, even by link.
    const classmatePage = await (await browser.newContext()).newPage();
    await signInWithPassword(classmatePage, classmate.email, classmate.password);
    await classmatePage.goto("/feed");
    await expect(classmatePage.getByTestId("post").filter({ hasText: text })).toBeVisible();
    const outsiderPage = await (await browser.newContext()).newPage();
    await signInWithPassword(outsiderPage, outsider.email, outsider.password);
    await outsiderPage.goto("/feed?tab=global");
    await expect(outsiderPage.getByTestId("post").filter({ hasText: text })).toHaveCount(0);
    await outsiderPage.goto(`/post/${postId}`);
    await expect(outsiderPage.getByText("This post isn't available")).toBeVisible();
    await axe(outsiderPage, "post (not visible)");
    const api = await apiAs(outsider);
    const direct = await api.from("posts").select("id").eq("id", postId!);
    expect(direct.data).toEqual([]);
    const forged = await api.rpc("create_post", { p: { type: "general", body: "x".repeat(2001) } });
    expect(forged.error?.code).toBe("23514");

    // Delete.
    await page.reload();
    await page.getByTestId("post").filter({ hasText: text }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("post").filter({ hasText: text })).toHaveCount(0);
    await classmatePage.goto(`/post/${postId}`);
    await expect(classmatePage.getByText("This post isn't available")).toBeVisible();

    expect(problems).toEqual([]);
  });

  test("global poll and event across universities, filters, invite with Apply, update images", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const owner = await createStudent({ domain: "nutech.edu.pk", fullName: "Olivia Owner" });
    const voter = await createStudent({ domain: "nu.edu.pk", fullName: "Vikram Voter" });
    const planner = await createStudent({ domain: "nu.edu.pk", fullName: "Paras Planner" });
    const tag = Date.now().toString(36);

    // A poll to the Global Feed.
    await signInWithPassword(page, owner.email, owner.password);
    await page.goto("/feed?tab=global");
    const composer = page.getByTestId("composer");
    await composer.getByRole("radio", { name: "Poll" }).click();
    await composer.getByLabel("Question").fill(`Best study spot ${tag}?`);
    await composer.getByLabel("Option 1").fill("Library");
    await composer.getByLabel("Option 2").fill("Cafe");
    await expect(composer.getByRole("radio", { name: "Global" })).toHaveAttribute("aria-checked", "true");
    await axe(page, "composer (poll)");
    await composer.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByTestId("post").filter({ hasText: `Best study spot ${tag}?` })).toBeVisible();

    // Someone at another university votes once and sees results.
    const voterPage = await (await browser.newContext()).newPage();
    await signInWithPassword(voterPage, voter.email, voter.password);
    await voterPage.goto("/feed?tab=global");
    const poll = voterPage.getByTestId("post").filter({ hasText: `Best study spot ${tag}?` });
    await expect(poll.getByText("results after you vote")).toBeVisible();
    await poll.getByRole("button", { name: "Cafe" }).click();
    await expect(poll.getByText("Cafe (your vote)")).toBeVisible();
    await expect(poll.getByText("1 vote")).toBeVisible();
    await expect(poll.getByRole("button", { name: "Library" })).toHaveCount(0);

    // An event from FAST, RSVP from the owner, and the Events filter.
    const plannerPage = await (await browser.newContext()).newPage();
    await signInWithPassword(plannerPage, planner.email, planner.password);
    await plannerPage.goto("/feed?tab=global");
    const pc = plannerPage.getByTestId("composer");
    await pc.getByRole("radio", { name: "Event" }).click();
    await pc.getByLabel("What's happening").fill(`Hack night ${tag}`);
    const when = new Date(Date.now() + 3 * 86400_000);
    const local = new Date(when.getTime() - when.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await pc.getByLabel("Date and time").fill(local);
    await pc.getByLabel("Place").fill("FAST Lab 2");
    await pc.getByRole("radio", { name: "Global" }).click();
    await pc.getByRole("button", { name: "Post", exact: true }).click();
    await expect(plannerPage.getByTestId("post").filter({ hasText: `Hack night ${tag}` })).toBeVisible();

    await page.goto("/feed?tab=global&filter=events");
    const event = page.getByTestId("post").filter({ hasText: `Hack night ${tag}` });
    await expect(event).toBeVisible();
    await expect(page.getByTestId("post").filter({ hasText: `Best study spot ${tag}?` })).toHaveCount(0);
    await event.getByRole("button", { name: "Going" }).click();
    await expect(event.getByText("1 going · 0 interested")).toBeVisible();
    await expect(event.getByRole("button", { name: "Going" })).toHaveAttribute("aria-pressed", "true");
    await axe(page, "feed (events filter)");

    // A venture invite: readers get Apply, which opens the venture.
    const api = await apiAs(owner);
    const { data: ventureId, error } = await api.rpc("create_venture", {
      p: { type: "project", title: `Solar cart ${tag}`, description: "A solar golf cart for campus.", roles: [{ title: "Electrical engineer", slots: 1 }] },
    });
    expect(error).toBeNull();
    await page.goto("/feed?tab=global");
    await page.waitForTimeout(30_500); // the 30 s cooldown after the poll
    const oc = page.getByTestId("composer");
    await oc.getByRole("radio", { name: "Venture invite" }).click();
    await oc.getByLabel("What's on your mind?").fill(`We need an electrical engineer ${tag}`);
    await oc.getByRole("radio", { name: "Global" }).click();
    await oc.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByTestId("post").filter({ hasText: `We need an electrical engineer ${tag}` })).toBeVisible();

    await voterPage.goto("/feed?tab=global&filter=ventures");
    const invite = voterPage.getByTestId("post").filter({ hasText: `Solar cart ${tag}` });
    await expect(invite.getByTestId("invite")).toContainText("Electrical engineer");
    await invite.getByRole("link", { name: "Apply" }).click();
    await expect(voterPage).toHaveURL(new RegExp(`/ventures/${ventureId}$`));

    // Venture updates take images too.
    await page.goto(`/ventures/${ventureId}/updates`);
    await page.getByLabel("Post an update").fill("First prototype wired up.");
    await page.getByTestId("update-images").setInputFiles(await photo());
    await expect(page.getByRole("list", { name: "Images to post" }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText("First prototype wired up.")).toBeVisible();
    await expect(page.locator('img[src*="/post-media/"]').first()).toBeVisible();
  });
});
