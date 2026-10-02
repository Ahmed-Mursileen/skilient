import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { adminClient, createStudent, signInWithPassword, type TestStudent } from "../e2e/support";

/**
 * Real product captures for the marketing pages (docs/marketing-design-plan.md B5). Runs the
 * built app on the local stack with fictional sample content (never production), takes element
 * screenshots at 2x in light and dark, and writes AVIF + WebP to public/marketing/captures/ with
 * content/captures.json. Run with `pnpm marketing:captures` after a build; re-run when the UI changes.
 */

const OUT = path.join(process.cwd(), "public/marketing/captures");
const MANIFEST = path.join(process.cwd(), "content/captures.json");
const SCREEN = 390;
const DPR = 2;

type Theme = "light" | "dark";
interface Shot {
  w: number;
  h: number;
  light: { avif: string; webp: string };
  dark: { avif: string; webp: string };
}

async function encode(name: string, theme: Theme, png: Buffer): Promise<{ avif: string; webp: string }> {
  await sharp(png).avif({ quality: 62, effort: 6 }).toFile(path.join(OUT, `${name}-${theme}.avif`));
  await sharp(png).webp({ quality: 80 }).toFile(path.join(OUT, `${name}-${theme}.webp`));
  return { avif: `/marketing/captures/${name}-${theme}.avif`, webp: `/marketing/captures/${name}-${theme}.webp` };
}

async function setTheme(page: Page, theme: Theme) {
  await page.evaluate((t) => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(t);
    document.documentElement.style.colorScheme = t;
  }, theme);
  await page.waitForTimeout(150);
}

/** Captures one element in both themes. */
async function shoot(page: Page, name: string, el: Locator): Promise<Shot> {
  const box = (await el.boundingBox())!;
  const out: Partial<Shot> = { w: Math.round(box.width), h: Math.round(box.height) };
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    out[theme] = await encode(name, theme, await el.screenshot({ animations: "disabled", caret: "hide" }));
  }
  await setTheme(page, "light");
  return out as Shot;
}

/** Captures a page region (CSS px) in both themes. */
async function shootClip(page: Page, name: string, clip: { x: number; y: number; width: number; height: number }): Promise<Shot> {
  const out: Partial<Shot> = { w: Math.round(clip.width), h: Math.round(clip.height) };
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    out[theme] = await encode(name, theme, await page.screenshot({ clip, animations: "disabled", caret: "hide" }));
  }
  await setTheme(page, "light");
  return out as Shot;
}

function apiAs(student: TestStudent) {
  const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const api = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  return api.auth.signInWithPassword({ email: student.email, password: student.password }).then(() => api);
}

/** n fictional readers who ticked `dimension` on a post. */
async function ticks(postId: string, dimension: string, n: number, tag: string) {
  const db = adminClient();
  const { data: q } = await db.from("micro_survey_questions").select("id").eq("dimension", dimension).order("id").limit(1).single();
  for (let i = 0; i < n; i++) {
    const r = await createStudent({ domain: "nutech.edu.pk", fullName: `Sample Reader ${tag}${i}` });
    const a = await db.from("micro_survey_assignments").insert({ post_id: postId, user_id: r.id, question_id: q!.id, dimension });
    if (a.error) throw new Error(a.error.message);
    const s = await db.from("micro_survey_responses").insert({
      post_id: postId, user_id: r.id, question_id: q!.id, dimension, answer: true, latency_ms: 6000, weight: 1, locked_at: new Date().toISOString(),
    });
    if (s.error) throw new Error(s.error.message);
  }
}

test("hero: the University Feed on a phone, before and after the tick", async ({ browser }) => {
  test.setTimeout(240_000);
  await mkdir(OUT, { recursive: true });

  // Fictional sample people and posts at NUTECH (decisions 2026-10-02).
  const hira = await createStudent({ domain: "nutech.edu.pk", fullName: "Hira Baig" });
  const usman = await createStudent({ domain: "nutech.edu.pk", fullName: "Usman Tariq" });
  const reader = await createStudent({ domain: "nutech.edu.pk", fullName: "Zainab Qureshi" });
  const textA = "Our React build took 4 minutes. Caching dependencies in CI and splitting out the admin pages got it to 40 seconds. Config diff is in our repo.";
  const textB = "Shipped: our lab booking app is live for second-year CS students.";
  // Earlier runs' sample posts would show up twice.
  await adminClient().from("posts").delete().like("body", "Our React build took 4 minutes%");
  await adminClient().from("posts").delete().like("body", "%lab booking app%");
  const postB = (await (await apiAs(usman)).rpc("create_post", { p: { type: "general", audience: "university", body: textB, media: [] } })).data as string;
  const postA = (await (await apiAs(hira)).rpc("create_post", { p: { type: "general", audience: "university", body: textA, media: [] } })).data as string;
  expect(postA && postB).toBeTruthy();
  await ticks(postA, "informative", 11, "a");
  await ticks(postB, "interesting", 14, "b");
  const db = adminClient();
  const { data: q } = await db.from("micro_survey_questions").select("id").eq("text", "Was this informative?").single();
  await db.from("micro_survey_assignments").insert({ post_id: postA, user_id: reader.id, question_id: q!.id, dimension: "informative" });
  // The reader already answered post B, so only post A asks a question.
  const { data: qb } = await db.from("micro_survey_questions").select("id").eq("dimension", "interesting").order("id").limit(1).single();
  await db.from("micro_survey_assignments").insert({ post_id: postB, user_id: reader.id, question_id: qb!.id, dimension: "interesting" });
  await db.from("micro_survey_responses").insert({
    post_id: postB, user_id: reader.id, question_id: qb!.id, dimension: "interesting", answer: true, latency_ms: 6000, weight: 1,
    locked_at: new Date().toISOString(),
  });

  const context = await browser.newContext({ viewport: { width: SCREEN, height: 844 }, deviceScaleFactor: DPR, reducedMotion: "reduce" });
  const page = await context.newPage();
  await signInWithPassword(page, reader.email, reader.password);
  await page.goto("/feed");
  const cardA = page.getByTestId("post").filter({ hasText: "Our React build took 4 minutes" });
  const cardB = page.getByTestId("post").filter({ hasText: "lab booking app" });
  await expect(cardA.getByTestId("survey-strip")).toBeVisible();
  await expect(cardB).toBeVisible();
  // Hide the toasts, tooltips and tour so only the feed is in the picture.
  await page.addStyleTag({ content: "[data-sonner-toaster],[role=tooltip]{display:none!important}" });

  // The feed's top: the app bar and the University Feed / Global Feed tabs.
  await page.evaluate(() => window.scrollTo(0, 0));
  const tabs = (await page.getByRole("navigation", { name: "Feeds" }).boundingBox())!;
  const top = await shootClip(page, "hero-top", { x: 0, y: 0, width: SCREEN, height: Math.round(tabs.y + tabs.height + 12) });
  // Fixed and sticky bars (top bar, phone tabs) would otherwise sit on top of the cards.
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") el.style.setProperty("visibility", "hidden", "important");
    }
  });

  const shotB = await shoot(page, "hero-post-b", cardB);
  await cardA.scrollIntoViewIfNeeded();
  const before = await shoot(page, "hero-post-a-before", cardA);
  const yes = (await cardA.getByTestId("survey-strip").getByRole("button", { name: "Yes", exact: true }).boundingBox())!;
  const aBox = (await cardA.boundingBox())!;
  const tick = { x: Math.round(yes.x + yes.width / 2 - aBox.x), y: Math.round(yes.y + yes.height / 2 - aBox.y) };

  // Answer like a reader: after a real read, tap the tick. The line still reads 11 until reload.
  await page.waitForTimeout(6000);
  await cardA.getByTestId("survey-strip").getByRole("button", { name: "Yes", exact: true }).click();
  const answered = cardA.getByTestId("survey-answered");
  await expect(answered).toContainText("11 people");
  // The public line's box, a little wider so "12" fits too (the Answered mark sits far right).
  const a11 = (await cardA.boundingBox())!;
  const l11 = (await answered.locator("> div").first().boundingBox())!;
  const line = { x: Math.floor(l11.x - a11.x), y: Math.floor(l11.y - a11.y), w: Math.ceil(l11.width) + 16, h: Math.ceil(l11.height) };
  const lineBefore = await shootClip(page, "hero-line-11", { x: a11.x + line.x, y: a11.y + line.y, width: line.w, height: line.h });

  await page.reload();
  await expect(cardA.getByTestId("survey-answered")).toContainText("12 people");
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") el.style.setProperty("visibility", "hidden", "important");
    }
  });
  await cardA.scrollIntoViewIfNeeded();
  const a12 = (await cardA.boundingBox())!;
  const l12 = (await cardA.getByTestId("survey-answered").locator("> div").first().boundingBox())!;
  expect(Math.abs(l12.y - a12.y - line.y)).toBeLessThan(2);
  const after = await shoot(page, "hero-post-a-after", cardA);
  const lineAfter = await shootClip(page, "hero-line-12", { x: a12.x + line.x, y: a12.y + line.y, width: line.w, height: line.h });

  const manifest = {
    hero: { screen: SCREEN, top, postB: shotB, postABefore: before, postAAfter: after, line, lineBefore, lineAfter, tick },
  };
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  await context.close();
});
