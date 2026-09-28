import { createHmac, randomInt, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, watchConsole, type TestStudent } from "./support";

/**
 * Phase 2 slice 1 (PRD 5.5 P0): connecting GitHub never trusts the browser, Settings →
 * GitHub shows the connection, and webhooks are signed and idempotent. The real code
 * exchange runs in the github-link Edge Function (covered by tests/worker with a fake
 * GitHub); here it has no App secrets, so a correct callback ends in "couldn't connect".
 */
test.describe("GitHub connection", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  /** Stubs github.com and returns the `state` the app sent there. */
  async function connect(page: Page): Promise<URL> {
    await page.route("https://github.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>GitHub</title>" }));
    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await page.waitForURL(/^https:\/\/github\.com\//);
    return new URL(page.url());
  }

  test("connecting sends a per-user state to GitHub, and the callback refuses a state that isn't yours", async ({ page, browser }) => {
    const problems = watchConsole(page);
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Gul GitHub" });
    await signInWithPassword(page, student.email, student.password);
    await page.goto("/settings");
    await page.getByRole("main").getByRole("link", { name: /^GitHub/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "GitHub" })).toBeVisible();
    await axe(page, "settings/github (not connected)");

    const github = await connect(page);
    expect(github.pathname).toBe("/apps/skilient-e2e/installations/new");
    const state = github.searchParams.get("state") ?? "";
    expect(state).toMatch(/^[0-9a-f]{32}$/);

    // Another student's session can't use this state.
    const other = await createStudent({ domain: "nutech.edu.pk", fullName: "Other Student" });
    const otherPage = await (await browser.newContext()).newPage();
    await signInWithPassword(otherPage, other.email, other.password);
    await otherPage.goto(`/api/github/callback?code=stolen&installation_id=1&state=${state}`);
    await expect(otherPage).toHaveURL(/\/settings\/github\?github=state$/);
    await expect(otherPage.getByRole("main").getByRole("alert")).toContainText("expired or was opened in another account");

    // The right student with the right state gets as far as the Edge Function.
    await page.goto(`/api/github/callback?code=abc123&installation_id=1&setup_action=install&state=${state}`);
    await expect(page).toHaveURL(/\/settings\/github\?github=failed$/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Couldn't connect GitHub");
    // The state is single-use.
    await page.goto(`/api/github/callback?code=abc123&state=${state}`);
    await expect(page).toHaveURL(/\/settings\/github\?github=state$/);
    const { data: accounts } = await adminClient().from("github_accounts").select("user_id").in("user_id", [student.id, other.id]);
    expect(accounts).toEqual([]);
    expect(problems).toEqual([]);
  });

  async function seedConnection(student: TestStudent) {
    const admin = adminClient();
    const githubId = randomInt(10_000_000, 2_000_000_000);
    const installation = randomInt(10_000_000, 2_000_000_000);
    const repos = [randomInt(10_000_000, 2_000_000_000), randomInt(10_000_000, 2_000_000_000)];
    const login = `e2e-${githubId}`;
    const must = (r: { error: { message: string } | null }) => {
      if (r.error) throw new Error(r.error.message);
    };
    must(await admin.from("github_installations").insert({ installation_id: installation, account_id: githubId, account_login: login, account_type: "User" }));
    must(await admin.from("github_accounts").insert({ user_id: student.id, github_id: githubId, login }));
    must(await admin.from("github_user_installations").insert({ user_id: student.id, installation_id: installation }));
    must(
      await admin.from("github_repos").insert([
        { repo_id: repos[0], full_name: `${login}/secret-robot`, owner_id: githubId, private: true },
        { repo_id: repos[1], full_name: "club/website", owner_id: 5, private: false },
      ]),
    );
    must(
      await admin.from("github_user_repos").insert([
        { user_id: student.id, repo_id: repos[0], installation_id: installation, kind: "owned" },
        { user_id: student.id, repo_id: repos[1], installation_id: installation, kind: "collaborator" },
      ]),
    );
    must(
      await admin.from("sync_jobs").insert({
        user_id: student.id,
        trigger: "connect",
        status: "done",
        repos_total: 2,
        repos_done: 2,
        finished_at: new Date().toISOString(),
      }),
    );
    return { login, repos };
  }

  test("a connected student sees their repositories, can exclude one and can disconnect", async ({ page, browser }) => {
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Hina Connected" });
    const { login } = await seedConnection(student);
    await signInWithPassword(page, student.email, student.password);
    await page.goto("/settings/github");
    await expect(page.getByRole("heading", { name: `Connected as @${login}` })).toBeVisible();
    await expect(page.getByText(/Up to date: 2 repos/)).toBeVisible();
    await expect(page.getByText(`${login}/secret-robot`)).toBeVisible();
    await axe(page, "settings/github (connected)");

    const exclude = page.getByRole("switch", { name: "club/website" });
    await exclude.click();
    await expect(page.getByText("Excluded")).toBeVisible();
    // The switch flips at once and stays disabled until the save finishes; reload after that.
    await expect(exclude).toBeEnabled();
    await page.reload();
    await expect(page.getByRole("switch", { name: "club/website" })).not.toBeChecked();

    // A classmate never sees the private repository's name, even on the same university.
    const classmate = await createStudent({ domain: "nutech.edu.pk", fullName: "Classmate" });
    const classmatePage = await (await browser.newContext()).newPage();
    await signInWithPassword(classmatePage, classmate.email, classmate.password);
    await classmatePage.goto(`/profile/${student.username}`);
    await expect(classmatePage.getByRole("heading", { level: 1, name: "Hina Connected" })).toBeVisible();
    expect(await classmatePage.content()).not.toContain("secret-robot");

    await page.getByRole("button", { name: "Disconnect" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
    const { data } = await adminClient().from("github_user_repos").select("repo_id").eq("user_id", student.id);
    expect(data).toEqual([]);
  });

  test("skills show their level to classmates, and their evidence and next step to the owner", async ({ page, browser }) => {
    const problems = watchConsole(page);
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Sana Skills" });
    const { login, repos } = await seedConnection(student);
    const admin = adminClient();
    const must = (r: { error: { message: string } | null }) => {
      if (r.error) throw new Error(r.error.message);
    };
    const sha = (n: number) => n.toString(16).padStart(40, "a");
    const days = [3, 2, 1].map((d) => new Date(Date.now() - d * 86_400_000).toISOString());
    must(
      await admin.from("github_commits").insert([
        ...days.map((at, i) => ({
          user_id: student.id, repo_id: repos[0], sha: sha(i + 1), occurred_at: at, seen_via: "harvest",
          meaningful_lines: 60, status: "counted", extracted_at: at,
        })),
        { user_id: student.id, repo_id: repos[0], sha: sha(9), occurred_at: days[2], seen_via: "push", status: "held", extracted_at: days[2] },
      ]),
    );
    must(
      await admin.from("skill_evidence").insert([
        ...days.map((at, i) => ({
          user_id: student.id, skill_id: "python", repo_id: repos[0], sha: sha(i + 1),
          detectors: ["lines"], paths: [`app/m${i}.py`], lines: 60, occurred_at: at,
        })),
        { user_id: student.id, skill_id: "fastapi", repo_id: repos[0], sha: sha(1), detectors: ["import"], paths: ["app/m0.py"], lines: 0, occurred_at: days[0] },
      ]),
    );
    must(
      await admin.from("user_skills").insert([
        { user_id: student.id, skill_id: "python", level: 2, active_days: 3, lines: 180, hits: 0, repos: 1, last_used_at: days[2] },
        { user_id: student.id, skill_id: "fastapi", level: 1, active_days: 1, lines: 0, hits: 1, repos: 1, last_used_at: days[0] },
      ]),
    );

    // The owner: grouped chips, the drawer with counts, evidence and the next step.
    await signInWithPassword(page, student.email, student.password);
    await page.goto(`/profile/${student.username}/skills`);
    await expect(page.getByRole("heading", { name: "Languages" })).toBeVisible();
    await expect(page.getByText("Some of your activity is being reviewed (1 commit)")).toBeVisible();
    await axe(page, "profile/skills (owner)");
    await page.getByRole("button", { name: /^FastAPI, level 1/ }).click();
    const drawer = page.getByRole("dialog", { name: "FastAPI" });
    await expect(drawer.getByText("To reach L2, commit it on 2 more days (1 of 3) and import or add it in 2 more commits (1 of 3).")).toBeVisible();
    await expect(drawer.getByText(`${login}/secret-robot`)).toBeVisible();
    await expect(drawer.getByRole("link", { name: /^aaaaaaa/ })).toHaveAttribute("href", new RegExp(`/${login}/secret-robot/commit/`));
    await axe(page, "skill drawer (owner)");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await page.goto(`/profile/${student.username}`);
    await expect(page.getByRole("heading", { name: "Top skills" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`${login} on GitHub`) })).toHaveAttribute("href", `https://github.com/${login}`);
    await page.goto("/settings/github");
    await expect(page.getByText("Some of your activity is being reviewed")).toBeVisible();

    // A classmate: the level and when it was last used, never the evidence or the counts.
    const classmate = await createStudent({ domain: "nutech.edu.pk", fullName: "Classmate Viewer" });
    const other = await (await browser.newContext()).newPage();
    await signInWithPassword(other, classmate.email, classmate.password);
    await other.goto(`/profile/${student.username}/skills`);
    await other.getByRole("button", { name: /^Python, level 2: Written by them/ }).click();
    const theirs = other.getByRole("dialog", { name: "Python" });
    await expect(theirs.getByText("The commits behind this level are private to Sana.")).toBeVisible();
    await expect(theirs.getByText("Lines of code")).toHaveCount(0);
    expect(await other.content()).not.toContain("secret-robot");
    await expect(other.getByText("being reviewed")).toHaveCount(0);
    await axe(other, "skill drawer (classmate)");
    expect(problems).toEqual([]);
  });

  test("onboarding offers Connect GitHub, and skipping still works", async ({ page }) => {
    const student = await createStudent({ domain: "nu.edu.pk", fullName: "Onboarding GitHub", onboarded: false });
    const admin = adminClient();
    await admin
      .from("profiles")
      .update({ username: `e2e_${randomUUID().slice(0, 8)}`, department: "Computer Science", graduation_year: 2027 })
      .eq("user_id", student.id);
    await admin.from("onboarding_state").update({ step: 3 }).eq("user_id", student.id);
    await signInWithPassword(page, student.email, student.password);
    await expect(page).toHaveURL(/\/onboarding\/github$/);
    await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
    await axe(page, "onboarding/github");
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page).toHaveURL(/\/onboarding\/skills$/);
  });
});

test.describe("GitHub webhook", () => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  test.skip(!hasBackend || !secret, "needs the local stack and a webhook secret");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
  });

  test("refuses a bad signature, records a delivery once and ignores its replay", async ({ request }) => {
    const body = JSON.stringify({ action: "removed", installation: { id: 1 }, repositories_removed: [{ id: 1 }] });
    const signature = `sha256=${createHmac("sha256", secret!).update(body).digest("hex")}`;
    const delivery = randomUUID();
    const headers = { "content-type": "application/json", "x-github-event": "installation_repositories", "x-github-delivery": delivery };

    const bad = await request.post("/api/github/webhook", { data: body, headers: { ...headers, "x-hub-signature-256": "sha256=00" } });
    expect(bad.status()).toBe(401);
    const first = await request.post("/api/github/webhook", { data: body, headers: { ...headers, "x-hub-signature-256": signature } });
    expect(first.status()).toBe(202);
    const replay = await request.post("/api/github/webhook", { data: body, headers: { ...headers, "x-hub-signature-256": signature } });
    expect(replay.status()).toBe(202);
    const ping = await request.post("/api/github/webhook", {
      data: body,
      headers: { ...headers, "x-github-event": "ping", "x-hub-signature-256": signature },
    });
    expect(ping.status()).toBe(200);
  });
});
