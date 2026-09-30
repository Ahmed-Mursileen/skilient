import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, PASSWORD, signInWithPassword, totp, uniqueEmail, watchConsole, type TestStudent } from "./support";

/**
 * Phase 7 (PRD 5.21): a faculty account asks for the teacher role and is approved in /ops, posts a
 * project idea, a student starts a venture from it, the teacher accepts supervision, comments,
 * confirms an entry and reviews the venture. An unapproved teacher has student permissions only.
 */
test.describe("Teacher portal", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    await expect(page).toHaveTitle(/\S/);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  /** A confirmed faculty account (the signup form sends the same metadata) with the agreement accepted. */
  async function createFaculty(fullName: string): Promise<TestStudent> {
    const email = uniqueEmail("nutech.edu.pk", "fac");
    const db = adminClient();
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "faculty" },
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    await db.from("agreement_acceptances").insert({ user_id: data.user.id, version: 1 });
    return { id: data.user.id, email, password: PASSWORD, fullName, username: "" };
  }

  async function staffPage(browser: Browser, who: TestStudent): Promise<Page> {
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

  test("an unapproved teacher has student permissions only", async ({ page }) => {
    const faculty = await createFaculty("Dr Waiting");
    await signInWithPassword(page, faculty.email, faculty.password);
    await expect(page).toHaveURL(/\/teach\/apply$/);
    await expect(page.getByRole("heading", { level: 1, name: "Teacher role" })).toBeVisible();
    await axe(page, "apply");
    for (const path of ["/teach", "/teach/ideas", "/teach/ideas/new", "/teach/reviews", "/teach/code-checks", "/teach/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/teach\/apply$/);
    }
    await page.getByLabel("Department").fill("Computer Science");
    await page.getByLabel("Title").fill("Lecturer");
    await page.getByRole("button", { name: "Ask for the teacher role" }).click();
    await expect(page.getByTestId("teacher-pending")).toBeVisible();
  });

  test("approval, ideas, supervision, confirmation and a review", async ({ browser, page }) => {
    test.setTimeout(300_000);
    const problems = watchConsole(page);
    const db = adminClient();
    const faculty = await createFaculty("Dr Amna Teacher");
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Sana Student" });
    const accounts = await createStudent({ domain: "nutech.edu.pk", fullName: "Ayesha Accounts" });
    await db.from("staff_roles").insert({ user_id: accounts.id, role: "accounts", granted_by: accounts.id });

    // Faculty ask for the role and wait.
    await signInWithPassword(page, faculty.email, faculty.password);
    await expect(page).toHaveURL(/\/teach\/apply$/);
    await page.getByLabel("Department").fill("Software Engineering");
    await page.getByLabel("Title").fill("Assistant Professor");
    await page.getByRole("button", { name: "Ask for the teacher role" }).click();
    await expect(page.getByTestId("teacher-pending")).toBeVisible();

    // Accounts staff (two-factor) approve in /ops.
    const staff = await staffPage(browser, accounts);
    await staff.goto("/ops/teachers");
    await expect(staff.getByRole("heading", { level: 1, name: "Teachers" })).toBeVisible();
    await axe(staff, "ops teachers");
    const row = staff.getByTestId("teacher-request").filter({ hasText: faculty.email });
    await expect(row).toContainText("Assistant Professor");
    await row.getByTestId("approve-teacher").click();
    await expect(staff.getByTestId("teacher-request").filter({ hasText: faculty.email })).toHaveCount(0);

    // The teacher's portal opens.
    await page.goto("/teach");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome" })).toBeVisible();
    await expect(page.getByTestId("teach-todo")).toBeVisible();
    await axe(page, "teach home");
    const header = page.getByRole("navigation", { name: "Teacher portal" });
    await expect(header).toBeVisible();

    // A project idea.
    await page.goto("/teach/ideas/new");
    await page.getByLabel("Title").fill("Campus bus tracker");
    await page.getByLabel("Brief").fill("Show where each shuttle is, live, for students waiting at the gate.");
    await page.getByLabel("Skills teams will use").fill("React");
    await page.getByRole("button", { name: "Add React", exact: true }).click();
    await page.getByLabel("Deliverables").fill("A web app and a demo video");
    await page.getByLabel("Most teams").fill("1");
    await axe(page, "new idea");
    await page.getByRole("button", { name: "Post the idea" }).click();
    await expect(page).toHaveURL(/\/teach\/ideas\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Campus bus tracker" })).toBeVisible();
    const ideaUrl = page.url();

    // A student finds it in Explore and starts a venture from it.
    const studentPage = await (await browser.newContext()).newPage();
    await signInWithPassword(studentPage, student.email, student.password);
    await studentPage.goto("/explore?tab=ideas");
    await expect(studentPage.getByTestId("idea-results")).toContainText("Campus bus tracker");
    await axe(studentPage, "explore ideas");
    await studentPage.getByRole("link", { name: /Campus bus tracker/ }).click();
    await expect(studentPage.getByRole("heading", { level: 1, name: "Campus bus tracker" })).toBeVisible();
    await studentPage.getByRole("link", { name: "Start a venture from this idea" }).click();
    await expect(studentPage.getByTestId("idea-banner")).toContainText("Dr Amna Teacher");
    await expect(studentPage.getByLabel("Title")).toHaveValue("Campus bus tracker");
    await studentPage.getByRole("button", { name: "Create project" }).click();
    await expect(studentPage).toHaveURL(/\/ventures\/[0-9a-f-]{36}$/);
    const ventureId = studentPage.url().split("/").pop()!;

    // The idea closed at its team limit of one.
    await studentPage.goto("/explore?tab=ideas");
    await expect(studentPage.getByTestId("idea-results")).toHaveCount(0);

    // The teacher accepts supervision.
    await page.goto("/teach");
    await expect(page.getByTestId("supervision-invites")).toContainText("Campus bus tracker");
    await page.getByTestId("accept-supervision").click();
    await expect(page.getByTestId("supervised-ventures")).toContainText("Campus bus tracker");

    // The student sees the supervisor.
    await studentPage.goto(`/ventures/${ventureId}/reviews`);
    await expect(studentPage.getByTestId("supervisor-card")).toContainText("Dr Amna Teacher");
    await axe(studentPage, "venture reviews");

    // The venture is under way, with one of the student's entries.
    await db.from("ventures").update({ status: "in_progress" }).eq("id", ventureId);
    const { data: entry, error: entryError } = await db
      .from("contributions")
      .insert({ venture_id: ventureId, user_id: student.id, kind: "code", description: "Built the live map view" })
      .select("id")
      .single();
    expect(entryError).toBeNull();

    // The teacher comments and confirms the entry.
    await page.goto(`/teach/ventures/${ventureId}`);
    await expect(page.getByTestId("teacher-contributions")).toContainText("Built the live map view");
    await axe(page, "teacher venture");
    await page.getByLabel("Add a comment").fill("Please add a short README before the demo.");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByTestId("supervisor-thread")).toContainText("short README");
    await page.getByTestId("confirm-entry").click();
    await expect(page.getByTestId("teacher-contributions")).toContainText("Faculty-confirmed");

    // The student reads the comment and sees the faculty-confirmed mark.
    await studentPage.goto(`/ventures/${ventureId}/reviews`);
    await expect(studentPage.getByTestId("supervisor-thread")).toContainText("short README");
    await studentPage.goto(`/ventures/${ventureId}/contributions`);
    await expect(studentPage.getByText("Faculty-confirmed")).toBeVisible();

    // The owner asks for a review; the supervisor answers it.
    await studentPage.goto(`/ventures/${ventureId}/reviews`);
    await studentPage.getByLabel("Teacher at your university").selectOption(faculty.id);
    await studentPage.getByRole("button", { name: "Request a review" }).click();
    await expect(studentPage.getByTestId("review-requests")).toContainText("Waiting for the review");
    await page.goto("/teach/reviews");
    await expect(page.getByTestId("review-list")).toContainText("Campus bus tracker");
    await axe(page, "teacher reviews");
    await page.getByRole("link", { name: /Campus bus tracker/ }).click();
    for (const part of ["Problem and scope", "Technical quality", "Collaboration", "Documentation", "Outcome"]) {
      const group = page.getByRole("group", { name: part });
      await group.getByText("4 · Strong").click();
      await group.getByLabel("Comment").fill(`${part} looks solid`);
    }
    await axe(page, "review form");
    await page.getByRole("button", { name: "Submit the review" }).click();
    await expect(page.getByTestId("review-done")).toContainText("Average 4.0 of 5");

    // The team sees the scores; the venture shows "Reviewed by faculty".
    await studentPage.goto(`/ventures/${ventureId}/reviews`);
    await expect(studentPage.getByTestId("venture-reviews")).toContainText("Reviewed by faculty");
    await expect(studentPage.getByTestId("venture-reviews")).toContainText("Average 4.0 of 5");

    // The teacher endorses the student for a skill tagged in the venture.
    await page.goto(`/teach/ventures/${ventureId}`);
    await expect(page.getByTestId("endorse-left")).toContainText("40 left this month");
    await page.getByRole("button", { name: "Endorse", exact: true }).click();
    await page.getByRole("checkbox", { name: /React/ }).check();
    await page.getByRole("button", { name: "Give the endorsement" }).click();
    await expect(page.getByTestId("endorse-left")).toContainText("39 left this month");

    // The endorsement is stored as a teacher's, and the idea page lists the team.
    const { data: rows } = await db.from("endorsements").select("endorser_kind").eq("endorsee_id", student.id);
    expect(rows?.map((r) => r.endorser_kind)).toEqual(["teacher"]);
    await page.goto(ideaUrl);
    await expect(page.getByTestId("idea-teams")).toContainText("Campus bus tracker");

    expect(entry?.id).toBeTruthy();
    expect(problems).toEqual([]);
  });
});
