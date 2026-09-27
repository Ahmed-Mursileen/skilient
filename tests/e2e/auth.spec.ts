import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  codeFrom,
  createStudent,
  expectNoResidue,
  hasBackend,
  latestEmail,
  linkFrom,
  PASSWORD,
  signInWithPassword,
  totp,
  uniqueEmail,
  watchConsole,
} from "./support";

/**
 * Phase 1 auth flows (PRD 5.2 done-when): sign up with an allowed domain, a disallowed
 * domain and a duplicate; confirm in a second tab; reset password; sign out and sign in
 * as another user with zero residue; plus lockout, two-factor and the route gates.
 * Flows that create accounts run on the desktop project only.
 */
test.describe("auth", () => {
  test.skip(!hasBackend, "needs the local Supabase stack (E2E_SUPABASE_URL / E2E_SUPABASE_SECRET_KEY)");

  async function fillSignup(page: import("@playwright/test").Page, email: string, name = "Hina Test") {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("University email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("checkbox", { name: /I agree/ }).check();
  }

  test("sign up with a university email, confirm with the code, land in onboarding", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "account-creating flow runs once");
    const problems = watchConsole(page);
    const email = uniqueEmail("nutech.edu.pk");
    const started = Date.now();
    await fillSignup(page, email);
    await expect(page.getByText("Signing up as a student of")).toContainText("National University of Technology (NUTECH)");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/signup\/verify$/);
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    const mail = await latestEmail(email, started - 1000);
    await page.getByLabel("6-digit code").fill(codeFrom(mail.subject));
    await page.getByRole("button", { name: "Confirm email" }).click();

    await expect(page).toHaveURL(/\/onboarding\/university$/);
    expect(problems).toEqual([]);
  });

  test("personal and unknown email domains are refused", async ({ page }) => {
    await page.goto("/signup");
    const email = page.getByLabel("University email");
    await email.fill("someone@gmail.com");
    await expect(page.getByText("Use your university email.")).toBeVisible();
    await email.fill("someone@example.org");
    await expect(page.getByText("Your university isn't on Skilient yet.")).toBeVisible();
  });

  test("the server refuses a personal email even without the form's check", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
    await fillSignup(page, `someone-${Date.now()}@gmail.com`);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use your university email.").first()).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("a duplicate email is told to sign in instead", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "account-creating flow runs once");
    const existing = await createStudent({ domain: "nu.edu.pk", fullName: "Dup Licate" });
    await fillSignup(page, existing.email);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("This email is already registered. Sign in instead.");
  });

  test("confirming from the email link in a second tab advances the first", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "account-creating flow runs once");
    const email = uniqueEmail("nu.edu.pk");
    const started = Date.now();
    await fillSignup(page, email, "Tab Two");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/signup\/verify$/);

    const mail = await latestEmail(email, started - 1000);
    const second = await context.newPage();
    await second.goto(linkFrom(mail.html, "email"));
    await expect(second.getByRole("heading", { name: "You're confirmed" })).toBeVisible();

    // The first tab notices on its own.
    await expect(page).toHaveURL(/\/onboarding\/university$/, { timeout: 15_000 });
  });

  test("reset password by email, then sign in with the new one", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "account-changing flow runs once");
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Reset Person" });
    const started = Date.now();
    await page.goto("/forgot-password");
    await page.getByLabel("University email").fill(student.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("we've sent a reset link");

    const mail = await latestEmail(student.email, started - 1000);
    await page.goto(linkFrom(mail.html, "recovery"));
    await expect(page).toHaveURL(/\/reset-password$/);
    const fresh = "Brand-new-Passw0rd-2026";
    await page.getByLabel("New password", { exact: true }).fill(fresh);
    await page.getByLabel("Type it again", { exact: true }).fill(fresh);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL(/\/feed$/);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await signInWithPassword(page, student.email, fresh);
    await expect(page).toHaveURL(/\/feed$/);
  });

  test("sign out, then sign in as another student: zero residue, other tabs follow", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "account flow runs once");
    const a = await createStudent({ domain: "nutech.edu.pk", fullName: "Aisha Alpha" });
    const b = await createStudent({ domain: "nu.edu.pk", fullName: "Bilal Bravo" });

    await signInWithPassword(page, a.email, a.password);
    await expect(page).toHaveURL(/\/feed$/);
    await expect(page.getByRole("heading", { name: "Hi, Aisha" })).toBeVisible();
    await page.evaluate(() => {
      sessionStorage.setItem("draft", "Aisha's unsent draft");
      localStorage.setItem("sk:draft", "Aisha's unsent draft");
    });
    const other = await context.newPage();
    await other.goto("/feed");
    await expect(other.getByTestId("current-user-name")).toHaveText("Aisha Alpha");

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(other).toHaveURL(/\/$/, { timeout: 10_000 });
    expect(await page.evaluate(() => [sessionStorage.length, localStorage.getItem("sk:draft")])).toEqual([0, null]);

    await signInWithPassword(page, b.email, b.password);
    await expect(page).toHaveURL(/\/feed$/);
    await expect(page.getByRole("heading", { name: "Hi, Bilal" })).toBeVisible();
    await expect(page.getByTestId("current-user-name")).toHaveText("Bilal Bravo");
    await expectNoResidue(page, a);
    await page.goto("/settings/security");
    await expectNoResidue(page, a);
  });

  test("ten wrong passwords lock the account for 15 minutes", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Lock Test" });
    await page.goto("/signin");
    await page.getByLabel("University email").fill(student.email);
    for (let i = 1; i <= 9; i++) {
      await page.getByLabel("Password", { exact: true }).fill(`wrong-password-${i}`);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("That email and password don't match.");
    }
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-10");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many failed attempts");
    // Even the right password is refused while locked.
    await page.getByLabel("Password", { exact: true }).fill(student.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many failed attempts");
  });

  test("two-factor: turn it on, then sign-in asks for the code", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
    const student = await createStudent({ domain: "nu.edu.pk", fullName: "Totp Tester" });
    await signInWithPassword(page, student.email, student.password);
    await expect(page).toHaveURL(/\/feed$/);

    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Set up two-factor" }).click();
    const secret = (await page.locator("code").first().textContent())?.trim() ?? "";
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    await page.getByLabel("Code from the app").fill(totp(secret));
    await page.getByRole("button", { name: "Turn on two-factor" }).click();
    await expect(page.getByText("On", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await signInWithPassword(page, student.email, student.password);
    await expect(page).toHaveURL(/\/signin\/mfa$/);
    // Nothing else opens until the code is entered.
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/signin\/mfa\?next=%2Ffeed$/);
    await page.getByLabel("Authenticator code").fill(totp(secret));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/feed$/);
  });

  test("a new device shows up in recent activity", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Two Devices" });
    for (const _ of [1, 2]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signInWithPassword(page, student.email, student.password);
      await expect(page).toHaveURL(/\/feed$/);
      if (_ === 2) {
        await page.goto("/settings/security");
        await expect(page.getByText("Signed in from a new device")).toBeVisible();
      }
      await context.close();
    }
  });

  test("route gates: signed-out, agreement, signed-in on auth pages", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
    await page.goto("/settings/security");
    await expect(page).toHaveURL(/\/signin\?next=%2Fsettings%2Fsecurity$/);

    const student = await createStudent({ domain: "nu.edu.pk", fullName: "Gate Keeper", agreement: false });
    await page.getByLabel("University email").fill(student.email);
    await page.getByLabel("Password", { exact: true }).fill(student.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    // No acceptance yet (like a Google signup): the agreement comes first, then `next`.
    await expect(page).toHaveURL(/\/agreement\?next=%2Fsettings%2Fsecurity$/);
    await page.getByRole("button", { name: "I agree" }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);

    await page.goto("/signin");
    await expect(page).toHaveURL(/\/feed$/);
  });

});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`auth pages (${colorScheme})`, () => {
    test.use({ colorScheme });
    test("have no axe-core violations or CSP errors", async ({ page }) => {
      const problems = watchConsole(page);
      for (const path of ["/signin", "/signup", "/forgot-password", "/signup/verify", "/reset-password", "/auth/confirmed"]) {
        await page.goto(path);
        await page.locator("h1").first().waitFor();
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(results.violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      }
      expect(problems).toEqual([]);
    });
  });
}

test.describe("auth pages", () => {
  test("a refused Google account is told to use its university account", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&error_description=Use+your+university+Google+account.");
    await expect(page).toHaveURL(/\/signin\?error=google_domain$/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Use your university Google account.");
  });

  test("pages carry a per-request nonce CSP", async ({ request }) => {
    const [one, two] = await Promise.all([request.get("/signin"), request.get("/signin")]);
    const csp = one.headers()["content-security-policy"];
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toBe(two.headers()["content-security-policy"]);
  });
});
