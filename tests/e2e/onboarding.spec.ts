import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  adminClient,
  codeFrom,
  createStudent,
  hasBackend,
  latestEmail,
  PASSWORD,
  signInWithPassword,
  uniqueEmail,
  watchConsole,
} from "./support";

/**
 * Phase 1 done-when (build plan): two students at different universities sign up and
 * onboard; neither can read the other's university data (UI and direct API); plus resume,
 * visibility, image re-encode and axe on the new screens.
 */
test.describe("onboarding and profiles", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  async function photoWithGps(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "skilient-e2e-"));
    const file = join(dir, "photo.jpg");
    const buffer = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#2a6f97" } })
      .jpeg()
      .withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "33/1 41/1 0/1" } })
      .toBuffer();
    await writeFile(file, buffer);
    return file;
  }

  async function pick(page: Page, testId: string, option: string) {
    await page.getByTestId(testId).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }

  /** Full signup + all six steps through the UI. Returns the chosen username. */
  async function signUpAndOnboard(page: Page, domain: "nutech.edu.pk" | "nu.edu.pk", fullName: string, bio: string) {
    const email = uniqueEmail(domain);
    const started = Date.now();
    await page.goto("/signup");
    await page.getByLabel("Full name").fill(fullName);
    await page.getByLabel("University email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("checkbox", { name: /I agree/ }).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/signup\/verify$/);
    await page.getByLabel("6-digit code").fill(codeFrom((await latestEmail(email, started - 1000)).subject));
    await page.getByRole("button", { name: "Confirm email" }).click();

    // 1. University details
    await expect(page).toHaveURL(/\/onboarding\/university$/);
    await expect(page.getByText("Step 1 of 6")).toBeVisible();
    await axe(page, "step 1");
    await pick(page, "department", "Computer Science");
    await page.getByLabel("Programme").fill("BS Computer Science");
    await pick(page, "batch", `Class of ${new Date().getFullYear() + 1}`);
    await page.getByRole("button", { name: "Continue" }).click();

    // 2. Profile basics, with a photo that carries GPS data
    await expect(page).toHaveURL(/\/onboarding\/profile$/);
    await page.getByTestId("avatar-file").setInputFiles(await photoWithGps());
    await expect(page.getByRole("dialog", { name: "Crop your photo" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
    const username = `e2e_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    await page.getByLabel("Username").fill(username);
    await expect(page.getByText("Available")).toBeVisible();
    await page.getByLabel("One-line intro (optional)").fill(bio);
    await axe(page, "step 2");
    await page.getByRole("button", { name: "Continue" }).click();

    // 3. GitHub (skippable), 4. Skills
    await expect(page).toHaveURL(/\/onboarding\/github$/);
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page).toHaveURL(/\/onboarding\/skills$/);
    await page.getByRole("button", { name: "Continue" }).click();

    // 5. Looking for
    await expect(page).toHaveURL(/\/onboarding\/looking-for$/);
    await page.getByRole("checkbox", { name: "Internships" }).check();
    await page.getByRole("switch", { name: "Let recruiters find me" }).click();
    await axe(page, "step 5");
    await page.getByRole("button", { name: "Continue" }).click();

    // 6. Find your people, then finish
    await expect(page).toHaveURL(/\/onboarding\/people$/);
    await axe(page, "step 6");
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/\/onboarding\/done$/);
    await expect(page.getByRole("heading", { name: /You're in/ })).toBeVisible();
    await page.getByRole("link", { name: "Go to Home" }).click();
    await expect(page).toHaveURL(/\/feed$/);
    return { email, username };
  }

  test("two students at different universities sign up, onboard, and can't read each other's university data", async ({ browser }) => {
    test.setTimeout(180_000);
    const nutechContext = await browser.newContext();
    const fastContext = await browser.newContext();
    const aPage = await nutechContext.newPage();
    const bPage = await fastContext.newPage();
    const problems = [...watchConsole(aPage), ...watchConsole(bPage)];

    const a = await signUpAndOnboard(aPage, "nutech.edu.pk", "Amna Nutech", "A's secret intro about robotics");
    const b = await signUpAndOnboard(bPage, "nu.edu.pk", "Bashir Fast", "B's private note on compilers");

    // Own profile: everything, with the re-encoded photo.
    await aPage.goto(`/profile/${a.username}`);
    await expect(aPage.getByRole("heading", { level: 1, name: "Amna Nutech" })).toBeVisible();
    await expect(aPage.getByText("A's secret intro about robotics")).toBeVisible();
    await expect(aPage.getByText("National University of Technology (NUTECH)")).toBeVisible();
    await axe(aPage, "own profile");

    // Other university, default visibility "university": only the public card.
    await bPage.goto(`/profile/${a.username}`);
    await expect(bPage.getByRole("heading", { level: 1, name: "Amna Nutech" })).toBeVisible();
    await expect(bPage.getByTestId("restricted-card")).toBeVisible();
    await expect(bPage.getByText("Computer Science")).toBeVisible();
    await expect(bPage.getByText("A's secret intro about robotics")).toHaveCount(0);
    await expect(bPage.getByText("National University of Technology (NUTECH)")).toHaveCount(0);
    await aPage.goto(`/profile/${b.username}`);
    await expect(aPage.getByTestId("restricted-card")).toBeVisible();
    await expect(aPage.getByText("B's private note on compilers")).toHaveCount(0);

    // Direct API as B: no row for A in any identity table.
    const admin = adminClient();
    const { data: aRow } = await admin.from("profiles").select("user_id, avatar_path").eq("username", a.username).single();
    const asB = createClient(process.env.E2E_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    const { error: signInError } = await asB.auth.signInWithPassword({ email: b.email, password: PASSWORD });
    expect(signInError).toBeNull();
    for (const table of ["profiles", "onboarding_state", "security_events", "agreement_acceptances", "user_devices"] as const) {
      const { data, error } = await asB.from(table).select("*").eq("user_id", aRow!.user_id);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const { error: cardListError } = await asB.from("profiles_public_card").select("*");
    expect(cardListError?.code).toBe("42501");

    // The stored photo was re-encoded server-side: WebP, 512×512, no EXIF/GPS.
    expect(aRow!.avatar_path).toMatch(new RegExp(`^${aRow!.user_id}/[0-9a-f-]{36}\\.webp$`));
    const { data: file } = await admin.storage.from("avatars").download(aRow!.avatar_path!);
    const meta = await sharp(Buffer.from(await file!.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(["webp", 512, 512, undefined]);

    expect(problems).toEqual([]);
    await nutechContext.close();
    await fastContext.close();
  });

  test("onboarding resumes at the saved step after signing out; Back works, skipping ahead doesn't", async ({ page }) => {
    const student = await createStudent({ domain: "nu.edu.pk", fullName: "Resume Case", onboarded: false });
    await signInWithPassword(page, student.email, student.password);
    await expect(page).toHaveURL(/\/onboarding\/university$/);
    await page.getByTestId("department").click();
    await page.getByRole("option", { name: "Software Engineering", exact: true }).click();
    await page.getByTestId("batch").click();
    await page.getByRole("option", { name: `Class of ${new Date().getFullYear() + 2}`, exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/onboarding\/profile$/);

    await page.goto("/onboarding/people");
    await expect(page).toHaveURL(/\/onboarding\/profile$/);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/onboarding\/profile$/);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await signInWithPassword(page, student.email, student.password);
    await expect(page).toHaveURL(/\/onboarding\/profile$/);

    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/onboarding\/university$/);
    await expect(page.getByTestId("department")).toContainText("Software Engineering");
  });

  test("visibility decides who reads the full profile", async ({ browser }) => {
    const a = await createStudent({ domain: "nutech.edu.pk", fullName: "Vis Owner" });
    const b = await createStudent({ domain: "nu.edu.pk", fullName: "Vis Viewer" });
    await adminClient().from("profiles").update({ bio: "Only for the right people" }).eq("user_id", a.id);

    const aPage = await (await browser.newContext()).newPage();
    const bPage = await (await browser.newContext()).newPage();
    await signInWithPassword(bPage, b.email, b.password);
    await expect(bPage).toHaveURL(/\/feed$/);
    await bPage.goto(`/profile/${a.username}`);
    await expect(bPage.getByTestId("restricted-card")).toBeVisible();

    await signInWithPassword(aPage, a.email, a.password);
    await aPage.goto("/settings/profile");
    await axe(aPage, "settings/profile");
    await aPage.getByRole("radio", { name: /Everyone on Skilient/ }).check();
    await expect(aPage.getByText("Unsaved changes")).toBeVisible();
    await aPage.getByRole("button", { name: "Save changes" }).click();
    await expect(aPage.getByText("Saved.")).toBeVisible();

    await bPage.reload();
    await expect(bPage.getByText("Only for the right people")).toBeVisible();
    await expect(bPage.getByTestId("restricted-card")).toHaveCount(0);
  });

  test("profile edit refuses a taken username with a named fix", async ({ page }) => {
    const a = await createStudent({ domain: "nutech.edu.pk", fullName: "Name Taker" });
    const b = await createStudent({ domain: "nutech.edu.pk", fullName: "Name Wanter" });
    await signInWithPassword(page, b.email, b.password);
    await page.goto("/settings/profile");
    await page.getByLabel("Username").fill(a.username);
    await expect(page.getByText("That username is taken. Try another.")).toBeVisible();
  });
});

test("a signed-out visitor can't open a profile", async ({ page }) => {
  await page.goto("/profile/anyone");
  await expect(page).toHaveURL(/\/signin\?next=%2Fprofile%2Fanyone$/);
});
