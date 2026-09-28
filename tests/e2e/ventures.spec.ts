import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createStudent, hasBackend, signInWithPassword, watchConsole } from "./support";

/**
 * Phase 2 slice 5 (PRD 5.7, 5.28): start a venture, another student applies to a role, the
 * owner accepts on /requests and the team shows them. Deliverables stay with the team, and
 * completing needs one.
 */
test.describe("Ventures", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  async function axe(page: Page, label: string) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }

  test("create, apply, accept, and the team shows the new member", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const problems = watchConsole(page);
    const owner = await createStudent({ domain: "nutech.edu.pk", fullName: "Owais Owner" });
    const applicant = await createStudent({ domain: "nu.edu.pk", fullName: "Amna Applicant" });
    const outsider = await createStudent({ domain: "nu.edu.pk", fullName: "Omar Outsider" });
    const title = `Campus bus tracker ${Date.now().toString(36)}`;

    // Owner starts a public project with one role and one question.
    await signInWithPassword(page, owner.email, owner.password);
    await page.goto("/ventures");
    await expect(page.getByRole("heading", { level: 1, name: "Ventures" })).toBeVisible();
    await axe(page, "ventures");
    await page.getByRole("link", { name: "Start a venture" }).click();
    await expect(page).toHaveURL(/\/ventures\/new$/);
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("What are you building?").fill("Live bus locations for students, from a phone on each bus.");
    await page.getByRole("button", { name: "Add a role" }).click();
    await page.getByLabel("Role 1", { exact: true }).fill("Mobile developer");
    await page.getByRole("button", { name: "Add a question" }).click();
    await page.getByLabel("Question 1", { exact: true }).fill("Which phone do you use?");
    await axe(page, "ventures/new");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    const ventureUrl = new URL(page.url()).pathname;
    expect(ventureUrl).toMatch(/^\/ventures\/[0-9a-f-]{36}$/);
    await expect(page.getByText("You started this venture")).toBeVisible();
    await axe(page, "venture about (owner)");

    // Completing needs members and a deliverable; the owner can't skip that.
    await page.getByRole("navigation", { name: "Venture sections" }).getByRole("link", { name: "Manage" }).click();
    await page.getByRole("button", { name: "Start building" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Start building" }).click();
    await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
    await expect(page.getByText("To complete it you need at least 2 members")).toBeVisible();
    await page.getByRole("button", { name: "Mark complete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mark complete" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("at least 2 members");
    await page.keyboard.press("Escape");
    await axe(page, "venture manage");

    // The applicant finds it and applies to the role.
    const applicantPage = await (await browser.newContext()).newPage();
    await signInWithPassword(applicantPage, applicant.email, applicant.password);
    await applicantPage.goto("/ventures");
    await applicantPage.getByRole("link", { name: title }).click();
    await expect(applicantPage.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await applicantPage.getByRole("button", { name: "Apply to a role" }).click();
    const sheet = applicantPage.getByRole("dialog");
    await expect(sheet.getByRole("radio", { name: "Mobile developer" })).toBeChecked();
    await sheet.getByLabel("Which phone do you use?").fill("An Android phone.");
    await sheet.getByLabel("Why you'd like to join").fill("I built our department's timetable app in Flutter.");
    await axe(applicantPage, "apply sheet");
    await sheet.getByRole("button", { name: "Send application" }).click();
    await expect(applicantPage.getByText("Application sent")).toBeVisible();
    await applicantPage.goto("/requests?tab=sent");
    await expect(applicantPage.getByRole("article")).toContainText(title);
    await expect(applicantPage.getByRole("article")).toContainText("Waiting");

    // The owner accepts on /requests, after reading the answer.
    await page.getByRole("link", { name: "Requests", exact: true }).click();
    await expect(page).toHaveURL(/\/requests$/);
    const card = page.getByRole("article", { name: `Application from ${applicant.fullName}` });
    await expect(card).toContainText("An Android phone.");
    await expect(card).toContainText("as Mobile developer");
    await axe(page, "requests");
    await card.getByRole("button", { name: "Accept" }).click();
    await expect(card).toContainText("Accepted");

    // Both see the team; the applicant now counts as a member.
    await page.goto(`${ventureUrl}/team`);
    await expect(page.getByRole("main")).toContainText(applicant.fullName);
    await expect(page.getByRole("main")).toContainText("2 of 4 members");
    await axe(page, "venture team (owner)");
    await applicantPage.goto(ventureUrl);
    await expect(applicantPage.getByText("You're on the team")).toBeVisible();

    // A member adds a deliverable; an outsider sees only the count.
    await applicantPage.goto(`${ventureUrl}/deliverables`);
    await applicantPage.getByLabel("Name", { exact: true }).fill("Live app");
    await applicantPage.getByLabel("Link", { exact: true }).fill("https://example.com/bus");
    await applicantPage.getByRole("button", { name: "Add deliverable" }).click();
    await expect(applicantPage.getByRole("link", { name: /Live app/ })).toBeVisible();
    await axe(applicantPage, "venture deliverables (member)");

    const outsiderPage = await (await browser.newContext()).newPage();
    await signInWithPassword(outsiderPage, outsider.email, outsider.password);
    await outsiderPage.goto(`${ventureUrl}/deliverables`);
    await expect(outsiderPage.getByRole("heading", { name: "1 deliverable" })).toBeVisible();
    await expect(outsiderPage.getByText("Only the team sees its deliverables.")).toBeVisible();
    expect(await outsiderPage.content()).not.toContain("https://example.com/bus");
    await expect(outsiderPage.getByRole("button", { name: "Follow" })).toBeVisible();
    await axe(outsiderPage, "venture deliverables (outsider)");

    // Now it can complete, and the applicant's profile lists it.
    await page.goto(`${ventureUrl}/manage`);
    await page.getByRole("button", { name: "Mark complete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mark complete" }).click();
    await expect(page.getByText("This venture is complete")).toBeVisible();
    await applicantPage.goto(`/profile/${applicant.username}/ventures`);
    await expect(applicantPage.getByRole("link", { name: title })).toBeVisible();
    await expect(applicantPage.getByRole("main")).toContainText("Completed");

    // Old routes still land on Ventures.
    await page.goto("/startups");
    await expect(page).toHaveURL(/\/ventures\?type=startup$/);

    expect(problems).toEqual([]);
  });
});
