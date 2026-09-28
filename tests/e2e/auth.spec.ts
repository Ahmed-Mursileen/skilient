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
 * as another user with zero residue; plus sign-in throttling (no lockout), the emailed
 * sign-in code, two-factor with backup codes, and the route gates.
 * Flows that create accounts run on the desktop project only.
 */
test.describe("auth", () => {
  test.skip(!hasBackend, "needs the local Supabase stack (E2E_SUPABASE_URL / E2E_SUPABASE_SECRET_KEY)");

  async function axe(page: import("@playwright/test").Page, label: string) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

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

  test("wrong passwords slow sign-in down but never lock it, and the emailed code always works", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Slow Down" });
    await page.goto("/signin");
    await page.getByLabel("University email").fill(student.email);
    const signInButton = page.getByRole("button", { name: /^(Sign in|Try again in \d+s)$/ });
    for (let i = 1; i <= 9; i++) {
      await page.getByLabel("Password", { exact: true }).fill(`wrong-password-${i}`);
      await signInButton.click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("That email and password don't match.");
    }
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-10");
    await signInButton.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Wait 2 seconds");
    await expect(signInButton).toBeDisabled();
    // Seconds, not a lockout: the right password works once the wait is over.
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled({ timeout: 10_000 });
    await page.getByLabel("Password", { exact: true }).fill(student.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/feed$/);

    // The emailed sign-in code.
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/signin");
    await page.getByRole("link", { name: "Email me a sign-in code instead" }).click();
    await expect(page).toHaveURL(/\/signin\/code$/);
    await axe(page, "signin/code (email)");
    const started = Date.now();
    await page.getByLabel("University email").fill(student.email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await axe(page, "signin/code (code)");
    const mail = await latestEmail(student.email, started);
    expect(mail.subject).toMatch(/^Your Skilient sign-in code: \d{6}$/);
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("That code is wrong");
    await page.getByLabel("6-digit code").fill(codeFrom(mail.subject));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/feed$/);
  });

  test("asking for a code never reveals whether an account exists", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
    await page.goto("/signin/code");
    await page.getByLabel("University email").fill(uniqueEmail("nu.edu.pk", "nobody"));
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await page.getByRole("button", { name: "Use a different email" }).click();
    await expect(page.getByRole("heading", { name: "Sign in with a code" })).toBeVisible();
  });

  test("two-factor: backup codes at set-up, a second authenticator, and signing in with a backup code", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "runs once");
    const student = await createStudent({ domain: "nu.edu.pk", fullName: "Totp Tester" });
    await signInWithPassword(page, student.email, student.password);
    await expect(page).toHaveURL(/\/feed$/);

    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Set up two-factor" }).click();
    const secret = (await page.locator("code").first().textContent())?.trim() ?? "";
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    await page.getByLabel("Code from the app").fill(totp(secret));
    await page.getByRole("button", { name: "Confirm" }).click();

    // Ten backup codes, shown once.
    const codeList = page.getByRole("list", { name: "Backup codes" });
    await expect(codeList.getByRole("listitem")).toHaveCount(10);
    const backupCodes = (await codeList.getByRole("listitem").allTextContents()).map((c) => c.trim());
    expect(backupCodes.every((c) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(c))).toBe(true);
    await axe(page, "settings/security (backup codes)");
    await expect(page.getByRole("button", { name: "Done" })).toBeDisabled();
    await page.getByRole("checkbox", { name: "I've saved these codes" }).check();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("On", { exact: true })).toBeVisible();
    await expect(page.getByText("10 of 10 left.")).toBeVisible();

    // A second authenticator; no new codes.
    await page.getByRole("button", { name: "Add another authenticator" }).click();
    const secondSecret = (await page.locator("code").first().textContent())?.trim() ?? "";
    expect(secondSecret).not.toBe(secret);
    await page.getByLabel("Code from the app").fill(totp(secondSecret));
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Authenticator app 2")).toBeVisible();
    await expect(page.getByRole("list", { name: "Backup codes" })).toHaveCount(0);
    await axe(page, "settings/security (two authenticators)");

    // Either app's code works at sign-in.
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await signInWithPassword(page, student.email, student.password);
    await expect(page).toHaveURL(/\/signin\/mfa$/);
    // Nothing else opens until the code is entered.
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/signin\/mfa\?next=%2Ffeed$/);
    await page.getByLabel("Authenticator code").fill(totp(secondSecret));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/feed$/);

    // Lost phone: a backup code gets in once, and turns two-factor off.
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await signInWithPassword(page, student.email, student.password);
    await expect(page).toHaveURL(/\/signin\/mfa$/);
    await page.getByRole("button", { name: "Use a backup code instead" }).click();
    await axe(page, "signin/mfa (backup code)");
    await page.getByLabel("Backup code").fill("zzzzz-zzzzz");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("That code didn't work.")).toBeVisible();
    await page.getByLabel("Backup code").fill(backupCodes[3].toUpperCase());
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/settings\/security\?backup=used$/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("two-factor is now off");
    await expect(page.getByRole("button", { name: "Set up two-factor" })).toBeVisible();
    await expect(page.getByText("Signed in with a backup code (two-factor turned off)")).toBeVisible();
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
      for (const path of ["/signin", "/signin/code", "/signup", "/forgot-password", "/signup/verify", "/reset-password", "/auth/confirmed"]) {
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
