import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, codeFrom, createStudent, hasBackend, latestEmail, PASSWORD, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 8 (PRD 5.20): a recruiter signs up with a company email, turns on two-factor, sets up the
 * organisation and waits for verification; Skilient staff verify it; Explore shows anonymised rows
 * until the full-profile plan is granted (a staff grant); a contact request is answered by the
 * student, who then chats with the company; jobs need pay, applications move through the pipeline;
 * a student can hide from one company. Key screens are checked with axe in both themes.
 */
test.describe("Recruiter portal", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

  /** axe on the current page in the light theme and again in the dark theme. */
  async function axeBothThemes(page: Page, label: string) {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.reload();
      await expect(page).toHaveTitle(/\S/);
      await expect(page.locator("html")).toHaveClass(new RegExp(scheme));
      const results = await new AxeBuilder({ page }).withTags(RULES).analyze();
      expect(results.violations.map((v) => `${label} (${scheme}) ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    }
  }

  async function createRecruiter(fullName: string, domain: string, tag = "rec"): Promise<TestStudent> {
    const email = `${tag}-${Math.random().toString(36).slice(2, 8)}@${domain}`;
    const db = adminClient();
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName, role: "recruiter" } });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    await db.from("agreement_acceptances").insert({ user_id: data.user.id, version: 1 });
    return { id: data.user.id, email, password: PASSWORD, fullName, username: "" };
  }

  /** Signs in and turns on two-factor on /settings/security, which is where the portal sends an aal1 session. */
  async function withTwoFactor(browser: Browser, who: TestStudent): Promise<Page> {
    const page = await (await browser.newContext()).newPage();
    await signInWithPassword(page, who.email, who.password);
    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Set up two-factor" }).click();
    const secret = (await page.locator("code").first().textContent())?.trim() ?? "";
    await page.getByLabel("Code from the app").fill(totp(secret));
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("checkbox", { name: "I've saved these codes" }).check();
    await page.getByRole("button", { name: "Done" }).click();
    return page;
  }

  async function giveSkills(student: TestStudent, skills: Record<string, number>, city: string, visible = true) {
    const db = adminClient();
    for (const [skill, level] of Object.entries(skills)) {
      const { error } = await db.from("user_skills").insert({ user_id: student.id, skill_id: skill, level });
      if (error) throw new Error(`user_skills: ${error.message}`);
    }
    const { error } = await db.from("profiles").update({ recruiter_visible: visible, availability: ["internship"], city }).eq("user_id", student.id);
    if (error) throw new Error(`profile: ${error.message}`);
  }

  /** Staff grants (phase 10 registry) for named keys; phase 8 names are aliases of the PRD keys. */
  async function grant(orgId: string, keys: string[]) {
    const db = adminClient();
    const ends = new Date(Date.now() + 86400_000).toISOString();
    const { error } = await db.from("entitlement_grants").insert(
      keys.map((key) => ({ subject_type: "org", subject_id: orgId, key, value: true, source: "admin", ends_at: ends, reason: "e2e" })),
    );
    if (error) throw new Error(`grant: ${error.message}`);
  }

  /** What phase 8's trial allowance gave every organisation: 3 seats, 5 credits a month, shortlists. */
  async function baseline(domain: string) {
    const db = adminClient();
    const { data: org } = await db.from("organizations").select("id").eq("domain", domain).single();
    const ends = new Date(Date.now() + 86400_000).toISOString();
    const rows = [
      { key: "org.seats", value: 3 },
      { key: "contact.credits", value: 5 },
      { key: "recruit.shortlists", value: true },
    ].map((r) => ({ ...r, subject_type: "org", subject_id: org!.id, source: "admin", ends_at: ends, reason: "e2e baseline" }));
    const { error } = await db.from("entitlement_grants").insert(rows);
    if (error) throw new Error(`baseline: ${error.message}`);
  }

  test("a recruiter signs up with a company email, and webmail is refused", async ({ page }) => {
    const domain = `acme-${Math.random().toString(36).slice(2, 8)}.example.com`;
    await page.goto("/signup/recruiter");
    await expect(page.getByRole("heading", { level: 1, name: "Hire on verified evidence" })).toBeVisible();
    await axeBothThemes(page, "recruiter signup");

    await page.getByLabel("Full name").fill("Rita Recruiter");
    await page.getByLabel("Work email").fill("rita@gmail.com");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("checkbox", { name: /I agree to the/ }).check();
    await page.getByRole("button", { name: "Create recruiter account" }).click();
    await expect(page.getByText(/Use your work email/)).toBeVisible();

    const email = `rita@${domain}`;
    await page.getByLabel("Work email").fill(email);
    const since = Date.now() - 2000;
    await page.getByRole("button", { name: "Create recruiter account" }).click();
    await page.waitForURL(/\/signup\/verify$/);
    const mail = await latestEmail(email, since);
    await page.getByLabel(/code/i).first().fill(codeFrom(mail.subject));
    await page.getByRole("button", { name: /confirm|verify|continue/i }).click();
    // Two-factor comes first: the portal sends an aal1 session to turn it on.
    await expect(page).toHaveURL(/\/settings\/security/);
    await expect(page.getByRole("button", { name: "Set up two-factor" })).toBeVisible();
    const { data } = await adminClient().from("profiles").select("role, university_id, onboarding_complete").eq("user_id", (await adminClient().auth.admin.listUsers()).data.users.find((u) => u.email === email)!.id).single();
    expect(data).toMatchObject({ role: "recruiter", university_id: null, onboarding_complete: true });
  });

  test("organisation, verification, explore, full search, contact, chat, jobs, and a company block", async ({ browser }) => {
    test.setTimeout(480_000);
    const db = adminClient();
    const domain = `acme-${Math.random().toString(36).slice(2, 8)}.example.com`;
    const rita = await createRecruiter("Rita Recruiter", domain);
    const staff = await createStudent({ domain: "nutech.edu.pk", fullName: "Ayesha Accounts" });
    await db.from("staff_roles").insert({ user_id: staff.id, role: "accounts", granted_by: staff.id });
    const s1 = await createStudent({ domain: "nutech.edu.pk", fullName: "Sana Strong" });
    const s2 = await createStudent({ domain: "nutech.edu.pk", fullName: "Bilal Beginner" });
    const s3 = await createStudent({ domain: "nutech.edu.pk", fullName: "Hina Hidden" });
    // A city of its own keeps this run's searches clear of students other runs left visible.
    const city = `Testville${Math.random().toString(36).slice(2, 8)}`;
    await giveSkills(s1, { react: 3, python: 2 }, city);
    await giveSkills(s2, { react: 2 }, city);
    await giveSkills(s3, { react: 4 }, city, false);

    // --- The recruiter sets up the organisation ------------------------------------------
    const rp = await withTwoFactor(browser, rita);
    const problems = watchConsole(rp);
    await rp.goto("/recruit");
    await expect(rp).toHaveURL(/\/org\/join$/);
    await expect(rp.getByRole("heading", { level: 1, name: "Set up your organisation" })).toBeVisible();
    await axeBothThemes(rp, "org join");
    await rp.getByLabel("Company name").fill("Acme Software");
    await rp.getByLabel("Company website").fill("https://www.other-site.com");
    await rp.getByLabel("Industry").fill("Software");
    await rp.getByTestId("org-size").click();
    await rp.getByRole("option", { name: "11-50 people" }).click();
    await rp.getByLabel("Main city").fill("Islamabad");
    await rp.getByLabel("Your role at the company").fill("Head of hiring");
    await rp.getByRole("button", { name: "Send for verification" }).click();
    await expect(rp.getByText(/website must match your work email domain/)).toBeVisible();
    await rp.getByLabel("Company website").fill(`https://www.${domain}`);
    await rp.getByRole("button", { name: "Send for verification" }).click();
    await expect(rp.getByTestId("recruit-pending")).toBeVisible();
    await expect(rp.getByTestId("org-status")).toHaveText(/Waiting for verification/);
    await axeBothThemes(rp, "pending home");
    await rp.goto("/recruit/search");
    await expect(rp.getByText("Talent search opens when you're verified")).toBeVisible();

    // --- Skilient staff verify it ---------------------------------------------------------
    const sp = await withTwoFactor(browser, staff);
    await sp.goto("/ops/orgs");
    await expect(sp.getByTestId("ops-org").filter({ hasText: "Acme Software" })).toBeVisible();
    await axeBothThemes(sp, "ops orgs");
    await sp.getByRole("link", { name: "Acme Software" }).click();
    await expect(sp.getByRole("heading", { level: 1, name: "Acme Software" })).toBeVisible();
    await sp.getByTestId("verify-org").click();
    await expect(sp.getByTestId("org-case-status")).toHaveText("Verified");
    const { data: org } = await db.from("organizations").select("id").eq("domain", domain).single();
    const orgId = org!.id as string;
    await baseline(domain);

    // --- Explore: anonymised, no names, no links ------------------------------------------
    await rp.goto(`/recruit/search?skills=react:2&city=${city}`);
    await expect(rp.getByTestId("search-mode")).toHaveText(/Explore/);
    await expect(rp.getByTestId("talent-row")).toHaveCount(2);
    const html = await rp.content();
    for (const hidden of [s1.fullName, s2.fullName, s3.fullName, s1.username, s2.username]) expect(html).not.toContain(hidden);
    expect(await rp.getByTestId("talent-row").locator("a").count()).toBe(0);
    await expect(rp.getByTestId("why-match").first()).toContainText("React");
    await axeBothThemes(rp, "explore");
    await rp.goto(`/recruit/search?skills=react:3&city=${city}`);
    await expect(rp.getByTestId("talent-row")).toHaveCount(1);
    // Protected attributes can't be asked for: the URL filters ignore them and the database refuses them.
    await rp.goto(`/recruit/search?gender=f&religion=x&city=${city}`);
    await expect(rp.getByTestId("talent-row")).toHaveCount(2);
    await expect(rp.getByLabel(/^(gender|religion|age|ethnicity|photo)$/i)).toHaveCount(0);

    // --- Full results need the plan; names appear only then -------------------------------
    await grant(orgId, ["talent.full_profile"]);
    await rp.goto(`/recruit/search?skills=react:2&city=${city}`);
    await expect(rp.getByTestId("search-mode")).toHaveText(/Full results/);
    await expect(rp.getByTestId("talent-row").filter({ hasText: s1.fullName })).toBeVisible();
    await expect(rp.getByTestId("talent-row").filter({ hasText: s3.fullName })).toHaveCount(0);
    await axeBothThemes(rp, "full results");

    // --- Candidate, shortlist, note, contact request --------------------------------------
    await rp.getByRole("link", { name: new RegExp(s1.fullName) }).click();
    await expect(rp.getByTestId("candidate-name")).toHaveText(s1.fullName);
    await expect(rp.getByTestId("candidate-skills")).toContainText("React");
    await rp.getByTestId("new-list-name").fill("Frontend");
    await rp.getByTestId("new-list-create").click();
    await expect(rp.getByTestId("shortlist-control")).toContainText("On: Frontend");
    await rp.getByTestId("note-body").fill("Strong React, follow up in March.");
    await rp.getByTestId("note-add").click();
    await expect(rp.getByTestId("notes")).toContainText("Strong React, follow up in March.");
    await axeBothThemes(rp, "candidate");
    await rp.getByTestId("contact-open").click();
    await rp.getByTestId("contact-role").fill("React intern");
    await rp.getByTestId("contact-message").fill("short");
    await rp.getByTestId("contact-send").click();
    await expect(rp.getByText(/at least 50 characters/)).toBeVisible();
    await rp.getByTestId("contact-message").fill("We are hiring a React intern for the summer and your verified work caught our eye. Could we talk?");
    await rp.getByTestId("contact-send").click();
    await expect(rp.getByTestId("last-contact")).toContainText("Waiting for an answer");

    // --- The student answers ---------------------------------------------------------------
    const s1page = await (await browser.newContext()).newPage();
    await signInWithPassword(s1page, s1.email, s1.password);
    await s1page.goto("/opportunities/contact_requests");
    await expect(s1page.getByTestId("opportunity-list")).toContainText("React intern");
    await s1page.getByRole("link", { name: "React intern" }).click();
    await expect(s1page.getByTestId("contact-message")).toContainText("verified work caught our eye");
    expect(await s1page.content()).not.toContain("Rita Recruiter");
    await s1page.getByRole("link", { name: "Acme Software" }).first().click();
    await expect(s1page.getByRole("heading", { level: 1, name: "Acme Software" })).toBeVisible();
    await axeBothThemes(s1page, "company page");
    await s1page.goBack();
    await s1page.getByTestId("accept-contact").click();
    await s1page.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
    await expect(s1page.getByText("Rita Recruiter · Acme Software").first()).toBeVisible();

    await rp.goto("/recruit/contacts");
    await expect(rp.getByTestId("contacts")).toContainText("Accepted");
    await expect(rp.getByTestId("credits")).toContainText("4 contact credits left");
    await axeBothThemes(rp, "contacts");

    await rp.goto("/notifications");
    await expect(rp.getByText(/A student accepted your request about React intern/)).toBeVisible();
    await expect(rp.getByText(/verified.*is verified|Acme Software is verified/).first()).toBeVisible();
    await axeBothThemes(rp, "recruiter notifications");

    // --- The recruiter and the student talk in the DM labelled with the company; the student closes it ---
    await rp.goto("/recruit/contacts");
    await rp.getByTestId("contacts").getByRole("link", { name: "Chat" }).click();
    await rp.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
    await expect(rp.getByRole("heading", { name: /Sana Strong/ })).toBeVisible();
    await rp.getByLabel("Message", { exact: true }).fill("Great, can you do Thursday at 3?");
    await rp.getByRole("button", { name: "Send" }).click();
    await expect(s1page.getByText("Great, can you do Thursday at 3?")).toBeVisible();
    await axeBothThemes(rp, "recruiter chat");
    const { data: request } = await db.from("contact_requests").select("id").eq("org_id", orgId).single();
    await s1page.goto(`/opportunities/contact-requests/${request!.id}`);
    await s1page.getByTestId("close-chat").click();
    await expect(s1page.getByText("You closed this conversation.")).toBeVisible();
    await rp.reload();
    await expect(rp.getByText("This chat isn't available")).toBeVisible();

    // --- A student hides from this company ----------------------------------------------------
    const s2page = await (await browser.newContext()).newPage();
    await signInWithPassword(s2page, s2.email, s2.password);
    await s2page.goto("/companies/" + (await db.from("organizations").select("slug").eq("id", orgId).single()).data!.slug);
    await s2page.getByTestId("block-company").click();
    await expect(s2page.getByTestId("unblock-company")).toBeVisible();
    await rp.goto(`/recruit/search?skills=react:2&city=${city}`);
    await expect(rp.getByTestId("talent-row")).toHaveCount(1);
    await rp.goto(`/recruit/candidates/${s2.id}`);
    await expect(rp.getByText("We couldn't find that page")).toBeVisible();

    // --- Jobs: pay is required, applying is one step, the pipeline notifies ----------------
    await rp.goto("/recruit/jobs/new");
    await rp.getByLabel("Title").fill("React intern");
    await rp.getByTestId("job-type").click();
    await rp.getByRole("option", { name: "Internship" }).click();
    await rp.getByLabel("Location").fill("Islamabad");
    await rp.getByLabel("Apply by").fill(new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
    await rp.getByLabel("Description").fill("Build and ship React features with a small team, mentored by senior engineers. You will own a real feature end to end.");
    await rp.getByTestId("job-save").click();
    await expect(rp.getByText(/Add the pay range/).first()).toBeVisible();
    await rp.getByLabel("From").fill("40000");
    await rp.getByLabel("To").fill("60000");
    await rp.getByTestId("job-save").click();
    await rp.waitForURL(/\/recruit\/jobs\/[0-9a-f-]{36}$/);
    await axeBothThemes(rp, "job editor");
    await rp.getByTestId("job-publish").click();
    await expect(rp.getByTestId("job-status")).toHaveText("Live");
    const jobUrl = rp.url();
    const jobId = jobUrl.split("/").pop()!;

    await s1page.goto(`/opportunities/jobs/${jobId}`);
    await expect(s1page.getByTestId("job-pay")).toContainText("PKR 40,000 to 60,000 per month");
    await axeBothThemes(s1page, "job (student)");
    await s1page.getByLabel(/Note to the recruiter/).fill("I built a React dashboard for my society.");
    await s1page.getByTestId("apply-submit").click();
    await s1page.waitForURL(/\/opportunities\/applications\/[0-9a-f-]{36}$/);
    await expect(s1page.getByTestId("stage")).toHaveText("Applied");

    await rp.goto(`/recruit/jobs/${jobId}/applicants`);
    await expect(rp.getByTestId("applicant")).toHaveCount(1);
    await axeBothThemes(rp, "pipeline");
    await rp.getByRole("button", { name: "Screening" }).click();
    await expect(rp.getByTestId("applicant").first()).toHaveAttribute("data-stage", "screening");
    await rp.getByRole("button", { name: "Interview" }).click();
    await expect(rp.getByTestId("applicant").first()).toHaveAttribute("data-stage", "interview");
    await rp.getByRole("button", { name: "Offer" }).click();
    await expect(rp.getByTestId("applicant").first()).toHaveAttribute("data-stage", "offer");
    await rp.getByRole("button", { name: "Hired" }).click();
    await expect(rp.getByTestId("applicant").first()).toHaveAttribute("data-stage", "hired");
    await s1page.reload();
    await expect(s1page.getByTestId("stage")).toHaveText("Hired");
    await expect(s1page.getByTestId("history").locator("li")).toHaveCount(5);
    const { data: hire } = await db.from("hires").select("kind, fee_status, org_id").eq("org_id", orgId).single();
    // Explore doesn't waive the hiring fee: it is invoiced at once (phase 10).
    expect(hire).toMatchObject({ kind: "intern", fee_status: "invoiced" });

    // Plan and team pages render for an admin.
    await rp.goto("/org/plan");
    await expect(rp.getByTestId("credits-left")).toContainText("4 of 5");
    await expect(rp.getByTestId("feature-talent.full_profile")).toHaveText("Included");
    await axeBothThemes(rp, "plan");
    await rp.goto("/org/members");
    await expect(rp.getByTestId("seats")).toContainText("1 of 3 seats used");
    await axeBothThemes(rp, "members");
    await rp.goto("/org/settings");
    await axeBothThemes(rp, "company settings");
    expect(problems).toEqual([]);
  });

  test("an invite on the company domain is single use and joins the organisation", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = adminClient();
    const domain = `invite-${Math.random().toString(36).slice(2, 8)}.example.com`;
    const admin = await createRecruiter("Ada Admin", domain, "ada");
    const mate = await createRecruiter("Tariq Teammate", domain, "tariq");
    const ap = await withTwoFactor(browser, admin);
    await ap.goto("/org/join");
    await ap.getByLabel("Company name").fill("Invite Co");
    await ap.getByLabel("Company website").fill(`https://${domain}`);
    await ap.getByLabel("Industry").fill("Software");
    await ap.getByTestId("org-size").click();
    await ap.getByRole("option", { name: "1-10 people" }).click();
    await ap.getByLabel("Main city").fill("Lahore");
    await ap.getByLabel("Your role at the company").fill("Founder");
    await ap.getByRole("button", { name: "Send for verification" }).click();
    await expect(ap.getByTestId("recruit-pending")).toBeVisible();
    await baseline(domain);
    await ap.goto("/org/members");
    await ap.getByLabel("Work email").fill("someone@gmail.com");
    await ap.getByRole("button", { name: "Send invite" }).click();
    await expect(ap.getByText(/work email address, not a personal one/)).toBeVisible();
    await ap.getByLabel("Work email").fill(mate.email);
    await ap.getByRole("button", { name: "Send invite" }).click();
    await expect(ap.getByTestId("invite-link")).toContainText("/signup/recruiter?invite=");
    await axeBothThemes(ap, "invite sent");

    const mp = await withTwoFactor(browser, mate);
    await mp.goto("/org/join");
    await expect(mp.getByTestId("org-invites")).toContainText("Invite Co");
    await mp.getByTestId("accept-invite").click();
    await mp.waitForURL(/\/recruit$/);
    await expect(mp.getByText("Recruiter portal · Invite Co")).toBeVisible();
    const { data: invites } = await db.from("org_invites").select("used_at, token_hash").eq("email", mate.email);
    expect(invites?.[0]?.used_at).not.toBeNull();
    expect(invites?.[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
