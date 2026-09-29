import AxeBuilder from "@axe-core/playwright";
import { createHash, randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 4 slice 4 (PRD 5.5 code checks, 5.21 rubric): a student with Python at L2 from their own
 * commits requests a check from the skill drawer, answers the three questions, and a trust
 * reviewer on two-factor grades it in /ops; passing makes Python L4.
 *
 * The code itself comes from the code-check Edge Function (GitHub's contents API, never stored),
 * which can't reach the database from the local stack (like the other functions; its logic is
 * tested in tests/worker/code-check.test.ts). Here the worker's pick and the first view are
 * recorded directly, and the pages show their "couldn't load the code" state for the snippet.
 */
test.describe("Code checks", () => {
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

  const sha = (s: string) => createHash("sha1").update(s).digest("hex");

  /** Python at L2 from three counted commits, as the GitHub worker would leave it. */
  async function seedPython(student: TestStudent) {
    const db = adminClient();
    const ghId = randomInt(10_000_000, 99_000_000);
    const repo = randomInt(10_000_000, 99_000_000);
    await db.from("github_accounts").insert({ user_id: student.id, github_id: ghId, login: `cc${ghId}` });
    await db.from("github_installations").insert({ installation_id: repo, account_id: ghId, account_login: `cc${ghId}`, account_type: "User" });
    await db.from("github_repos").insert({ repo_id: repo, full_name: `cc${ghId}/robot`, owner_id: ghId, private: true, default_branch: "main", languages: ["Python"] });
    await db.from("github_user_repos").insert({ user_id: student.id, repo_id: repo, installation_id: repo, kind: "owned" });
    for (const day of [1, 2, 3]) {
      const commit = sha(`${student.id}-${day}`);
      const at = `2026-08-0${day}T10:00:00Z`;
      const { error: e1 } = await db.from("github_commits").insert({
        user_id: student.id, repo_id: repo, sha: commit, occurred_at: at, seen_via: "harvest", meaningful_lines: 60, status: "counted", extracted_at: at,
      });
      expect(e1).toBeNull();
      const { error: e2 } = await db.from("skill_evidence").insert({
        user_id: student.id, skill_id: "python", repo_id: repo, sha: commit, detectors: ["lines"], paths: ["app/main.py"], lines: 60, occurred_at: at,
      });
      expect(e2).toBeNull();
    }
    await db.from("user_skills").upsert({ user_id: student.id, skill_id: "python", level: 2, active_days: 3, lines: 180, repos: 1 });
    return { repo, commit: sha(`${student.id}-2`) };
  }

  test("request from the drawer, answer, graded in /ops, L4", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Nida Coder" });
    const reviewer = await createStudent({ domain: "nutech.edu.pk", fullName: "Rehan Reviewer" });
    const db = adminClient();
    await db.from("staff_roles").insert({ user_id: reviewer.id, role: "trust_reviewer", granted_by: reviewer.id });
    const seeded = await seedPython(student);

    // The drawer offers a check for an L2 skill; requesting opens the check.
    await signInWithPassword(page, student.email, student.password);
    await page.goto(`/profile/${student.username}/skills`);
    await page.getByRole("button", { name: /^Python, level 2/ }).click();
    const drawer = page.getByRole("dialog", { name: "Python" });
    await drawer.getByRole("button", { name: "Request a code check" }).click();
    await expect(page).toHaveURL(/\/me\/code-checks\/[0-9a-f-]{36}$/);
    const checkId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByRole("heading", { name: "Picking a piece of your code" })).toBeVisible();
    await axe(page, "code check (preparing)");

    // The raw API refuses a second open check and a student grading.
    const api = await apiAs(student);
    expect((await api.rpc("request_code_check", { p_skill: "python" })).error?.code).toBe("55000");
    expect((await api.rpc("grade_code_check", { p_id: checkId, p_rubric: {}, p_feedback: "Great work" })).error?.code).toBe("42501");

    // The worker's pick (done here), then Start.
    await db.from("code_checks").update({ status: "ready", ready_at: new Date().toISOString(), repo_id: seeded.repo, sha: seeded.commit, path: "app/main.py", start_line: 3, end_line: 30 }).eq("id", checkId);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
    await axe(page, "code check (ready)");
    await page.getByRole("button", { name: "Start: show my code" }).click();
    // The function can't run locally: nothing is shown, and the clock hasn't started.
    await expect(page.getByRole("heading", { name: "We couldn't load your code" })).toBeVisible();
    const { data: waiting } = await db.from("code_checks").select("deadline_at").eq("id", checkId).single();
    expect(waiting!.deadline_at).toBeNull();

    // The first view, as the function records it, starts the 10 minutes and reveals the requirement.
    const now = Date.now();
    await db.from("code_checks").update({ snippet_served_at: new Date(now).toISOString(), deadline_at: new Date(now + 10 * 60_000).toISOString() }).eq("id", checkId);
    await page.reload();
    await expect(page.getByRole("timer")).toContainText(/\d:\d\d left/);
    await expect(page.getByRole("heading", { name: "The new requirement" })).toBeVisible();
    await page.getByLabel("1. What does this code do?").fill("Reads the timetable CSV and builds one entry per class.");
    await page.getByLabel(/^2\. Why is it written this way/).fill("A dict keyed by course code keeps lookups constant time.");
    await page.getByLabel(/^3\. How would you change it/).fill("Validate each row and skip bad ones with a logged warning.");
    await expect(page.getByText("Saved")).toBeVisible();
    await axe(page, "code check (in progress)");
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByText(/Handed in/)).toBeVisible();

    // The reviewer grades it in /ops.
    const tPage = await (await browser.newContext()).newPage();
    await signInWithPassword(tPage, reviewer.email, reviewer.password);
    await tPage.goto("/settings/security");
    await tPage.getByRole("button", { name: "Set up two-factor" }).click();
    const secret = (await tPage.locator("code").first().textContent())?.trim() ?? "";
    await tPage.getByLabel("Code from the app").fill(totp(secret));
    await tPage.getByRole("button", { name: "Confirm" }).click();
    await tPage.getByRole("checkbox", { name: "I've saved these codes" }).check();
    await tPage.getByRole("button", { name: "Done" }).click();
    await tPage.goto("/ops/evidence?tab=checks");
    const row = tPage.getByTestId("code-check-row").filter({ hasText: "Nida Coder" });
    await expect(row).toContainText("Nobody yet");
    await axe(tPage, "ops code checks");
    await row.getByRole("link", { name: "Python" }).click();
    await expect(tPage.getByText("The code shows once you claim the check.")).toBeVisible();
    await tPage.getByRole("button", { name: "Claim" }).click();
    await expect(tPage.getByText("Reads the timetable CSV and builds one entry per class.")).toBeVisible();
    for (const part of ["Explains the behaviour", "Justifies the design", "Accuracy"]) {
      await tPage.getByRole("group", { name: part }).getByRole("radio", { name: "Met", exact: true }).check();
    }
    await tPage.getByRole("group", { name: "Handles the change" }).getByRole("radio", { name: "Not met" }).check();
    await expect(tPage.getByText("3 of 4 met: passes.")).toBeVisible();
    await tPage.getByLabel("Feedback to the student").fill("Clear explanation; think about where the warnings go.");
    await axe(tPage, "ops code check grading");
    await tPage.getByRole("button", { name: "Save grade" }).click();
    await expect(tPage.getByRole("heading", { level: 2, name: "Passed" })).toBeVisible();
    const { data: audit } = await db.from("ops_audit_log").select("action").eq("staff_id", reviewer.id).order("action");
    expect(audit!.map((a) => a.action)).toEqual(["code_check.claim", "code_check.pass"]);

    // The student sees the result and Python at L4.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Passed: Python is now L4" })).toBeVisible();
    await expect(page.getByText("Clear explanation; think about where the warnings go.")).toBeVisible();
    await axe(page, "code check (passed)");
    await page.goto(`/profile/${student.username}/skills`);
    await expect(page.getByRole("button", { name: /^Python, level 4/ })).toBeVisible();

    expect(problems).toEqual([]);
  });
});
