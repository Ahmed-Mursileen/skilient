import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { issueCv, rotateKey } from "../../supabase/functions/_shared/cv/issue.ts";
import { formatCode } from "../../supabase/functions/_shared/cv/sign.ts";
import { dbFrom } from "../../supabase/functions/_shared/github/types.ts";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 5 (PRD 5.18; decisions.md 2026-10-01): the verified CV end to end. CVs are signed with
 * the cv-sign Edge Function's own code over a direct database connection (the local Edge
 * runtime can't reach the database, like the other functions), then the pages are driven:
 * /me/cv, a share link opened signed-out, /verify with every status, revocation, and a PDF
 * export whose one changed byte shows Altered.
 */
const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test.describe("Verified CV", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  let sql: ReturnType<typeof postgres>;
  const log = () => undefined;
  test.beforeAll(() => {
    sql = postgres(DB_URL, { max: 1, onnotice: () => undefined });
  });
  test.afterAll(async () => {
    await sql?.end();
  });

  async function issue(student: TestStudent, source: "first" | "monthly") {
    const db = dbFrom(sql);
    const [active] = await sql`select key_id from public.signing_keys where retired_at is null`;
    if (!active) await rotateKey({ db, log });
    const result = await issueCv({ db, log }, student.id, source);
    if (result.status !== "issued") throw new Error(`issue: ${result.status}`);
    return result.code;
  }

  async function spark(student: TestStudent) {
    const now = new Date().toISOString();
    const { error } = await adminClient().from("ranking_scores").insert({
      user_id: student.id, formula_version: 1, components: {}, proof: 150, momentum: 0, adjustments: 0, total: 150, ranked: true,
      tier: "spark", tier_met: "spark", percentile: 0.8, computed_at: now, published_at: now,
    });
    if (error) throw new Error(`ranking_scores: ${error.message}`);
  }

  async function axe(page: Page, label: string) {
    await expect(page).toHaveTitle(/\S/);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label}: ${v.id}`)).toEqual([]);
  }

  test("issue, share, verify, supersede and revoke", async ({ page, browser }) => {
    const errors = watchConsole(page);
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Ayesha Verified" });
    await spark(student);
    const first = await issue(student, "first");

    await signInWithPassword(page, student.email, student.password);
    await page.goto("/me/cv");
    await expect(page.getByTestId("cv-paper")).toContainText("Ayesha Verified");
    await expect(page.getByTestId("cv-paper")).toContainText(formatCode(first));
    await axe(page, "/me/cv");

    // Settings are saved for the next version.
    await page.getByLabel("Endorsements", { exact: true }).click();
    await page.getByRole("button", { name: "Save CV settings" }).click();
    await expect(page.getByText(/^Saved\. Your CV changes on/)).toBeVisible();

    // A share link, shown once, opened signed-out.
    await page.getByLabel("Label (optional)").fill("For Systems Ltd");
    await page.getByLabel("7 days").check();
    await page.getByRole("button", { name: "Make a share link" }).click();
    const url = new URL((await page.getByTestId("new-link-url").textContent()) ?? "");
    const shareUrl = `${url.pathname}${url.search}`;
    expect(shareUrl).toMatch(new RegExp(`^/cv/${student.username}\\?t=[A-Za-z0-9_-]{43}$`));
    const outsider = await (await browser.newContext()).newPage();
    await outsider.goto(shareUrl);
    await expect(outsider.getByTestId("cv-paper")).toContainText("Ayesha Verified");
    await axe(outsider, "/cv/[username]");
    await page.reload();
    await expect(page.getByTestId("cv-views")).toContainText("1 in the last 30 days");
    await expect(page.getByTestId("share-link").first()).toContainText("1 view");

    // Verify: valid, then superseded once a newer version exists; the link follows the newest.
    await outsider.goto(`/verify/${first.toLowerCase().slice(0, 5)}-${first.slice(5)}`);
    await expect(outsider.getByTestId("verify-status")).toHaveAttribute("data-status", "valid");
    await expect(outsider.getByTestId("verify-status")).toContainText("Ed25519, checked");
    await axe(outsider, "/verify/[code]");
    await adminClient().from("profiles").update({ graduation_year: 2028 }).eq("user_id", student.id);
    const second = await issue(student, "monthly");
    await outsider.goto(`/verify/${first}`);
    await expect(outsider.getByTestId("verify-status")).toHaveAttribute("data-status", "superseded");
    await outsider.goto(shareUrl);
    await expect(outsider.getByTestId("cv-paper")).toContainText(formatCode(second));

    // The student revokes the newest version: Revoked shows only code and dates, and the link
    // says "no longer available" rather than falling back.
    await page.goto("/me/cv");
    const current = page.getByTestId("cv-version").filter({ hasText: formatCode(second) });
    await current.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("button", { name: "Revoke this version" }).click();
    await expect(page.getByRole("heading", { name: "Your newest version is revoked" })).toBeVisible();
    await outsider.goto(`/verify/${second}`);
    await expect(outsider.getByTestId("verify-status")).toHaveAttribute("data-status", "revoked");
    await expect(outsider.getByTestId("verify-status")).toContainText(formatCode(second));
    await expect(outsider.locator("body")).not.toContainText("Ayesha Verified");
    await outsider.goto(shareUrl);
    await expect(outsider.getByText("This CV is no longer available")).toBeVisible();

    await outsider.goto("/verify/ZZZZZ-99999");
    await expect(outsider.getByTestId("verify-status")).toHaveAttribute("data-status", "not_found");
    await outsider.goto("/verify?code=zzzzz-99999");
    await expect(outsider).toHaveURL(/\/verify\/ZZZZZ99999$/);
    expect(errors).toEqual([]);
  });

  test("share links open at Spark; PDF export is Pro", async ({ page }) => {
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Bilal Below Spark" });
    await issue(student, "first");
    await signInWithPassword(page, student.email, student.password);
    await page.goto("/me/cv");
    await expect(page.getByTestId("share-locked")).toBeVisible();
    await expect(page.getByTestId("export-locked")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export ATS PDF" })).toBeDisabled();
  });

  test("a PDF export verifies, and one changed byte shows Altered", async ({ page }) => {
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Sara Exported" });
    const code = await issue(student, "first");
    // A staff grant of the Pro PDF export (phase 10 registry).
    await sql`
      insert into public.entitlement_grants (subject_type, subject_id, key, value, source, ends_at, reason)
      values ('user', ${student.id}, 'cv.pdf_export', 'true', 'admin', now() + interval '1 day', 'E2E cv.spec')`;

    await signInWithPassword(page, student.email, student.password);
    await page.goto("/me/cv");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export ATS PDF" }).click();
    const pdf = readFileSync((await (await download).path()) ?? "");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

    await page.goto(`/verify/${code}`);
    await page.getByTestId("pdf-file").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.getByRole("button", { name: "Check this PDF" }).click();
    await expect(page.getByTestId("pdf-result")).toContainText("matches a PDF issued under this code");
    await expect(page.getByTestId("verify-status")).toHaveAttribute("data-status", "valid");

    const altered = Buffer.from(pdf);
    altered[Math.floor(altered.length / 2)] ^= 0x01;
    await page.goto(`/verify/${code}`);
    await page.getByTestId("pdf-file").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: altered });
    await page.getByRole("button", { name: "Check this PDF" }).click();
    await expect(page.getByTestId("verify-status")).toHaveAttribute("data-status", "altered");
    await expect(page.getByTestId("pdf-result")).toContainText("doesn't match");
  });
});
