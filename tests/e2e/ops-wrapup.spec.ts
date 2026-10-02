import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 11 slice 5 (PRD 5.26): an organisation admin uploads a registration document that only
 * accounts staff can open; accounts staff onboard a university from the list (assign an owner
 * who has two-factor, add a domain) and read its tabs. axe in both themes on each new page.
 */
test.describe("Org documents and university onboarding", () => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "account flows run once, on desktop");
  });

  const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
  const PASSWORD = "Wrapup-e2e-Passw0rd!";

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

  async function twoFactorPage(browser: Browser, who: TestStudent): Promise<Page> {
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

  async function account(email: string, fullName: string, meta: Record<string, unknown>): Promise<TestStudent> {
    const db = adminClient();
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName, ...meta } });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    await db.from("agreement_acceptances").insert({ user_id: data.user.id, version: 1 });
    return { id: data.user.id, email, password: PASSWORD, fullName, username: "" };
  }

  test("documents for accounts staff only; onboarding a university", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = adminClient();
    const tag = Math.random().toString(36).slice(2, 8);

    // A fresh university (with its domain) and a pending organisation of our own.
    const uniDomain = `wrapup-${tag}.edu.pk`;
    const { data: uni, error: uniError } = await db
      .from("universities")
      .insert({ name: `Wrapup University ${tag}`, city: "Islamabad", slug: `wrapup-${tag}` })
      .select("id")
      .single();
    if (uniError || !uni) throw new Error(`university: ${uniError?.message}`);
    await db.from("university_domains").insert({ university_id: uni.id, domain: uniDomain, kind: "both" });
    const official = await account(`registrar-${tag}@${uniDomain}`, `Rida Registrar ${tag}`, { role: "university_admin", university_id: uni.id });

    const orgDomain = `wrapupco-${tag}.pk`;
    const recruiter = await account(`hr-${tag}@${orgDomain}`, `Hina Recruiter ${tag}`, { role: "recruiter" });
    const { data: org } = await db
      .from("organizations")
      .insert({ slug: `wrapupco-${tag}`, name: `Wrapup Co ${tag}`, domain: orgDomain, website: `https://${orgDomain}`, industry: "Software", size: "11-50", city: "Lahore", signer_role: "Founder", created_by: recruiter.id })
      .select("id")
      .single();
    await db.from("org_members").insert({ org_id: org!.id, user_id: recruiter.id, role: "admin" });

    const staff = await createStudent({ domain: "nutech.edu.pk", fullName: `Amna Accounts ${tag}` });
    await db.from("staff_roles").insert({ user_id: staff.id, role: "accounts", granted_by: staff.id });

    // The organisation admin uploads a registration document.
    const rPage = await twoFactorPage(browser, recruiter);
    await rPage.goto("/org/settings");
    const docForm = rPage.getByTestId("org-document-form");
    await docForm.getByLabel("PDF, up to 5 MB").setInputFiles({
      name: "registration.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n"),
    });
    await docForm.getByRole("button", { name: "Upload document" }).click();
    await expect(docForm.getByRole("status")).toContainText("Document received");
    await expect(docForm).toContainText("Uploaded");
    await axeBothThemes(rPage, "org settings");

    // Accounts staff see it on the organisation's case.
    const page = await twoFactorPage(browser, staff);
    const problems = watchConsole(page);
    await page.goto(`/ops/orgs/${org!.id}`);
    await expect(page.getByTestId("org-document").getByRole("link", { name: "Open the PDF" })).toBeVisible();

    // The official turns on two-factor, then staff onboard the university.
    const oPage = await twoFactorPage(browser, official);
    await oPage.close();
    await page.goto(`/ops/universities?q=${encodeURIComponent(`Wrapup University ${tag}`)}`);
    await page.getByTestId("ops-unis").getByRole("link", { name: `Wrapup University ${tag}` }).click();
    await expect(page.getByTestId("uni-not-onboarded")).toBeVisible();
    await axeBothThemes(page, "university");
    const assign = page.getByTestId("assign-owner");
    await assign.getByLabel("Official's email").fill(official.email);
    await assign.getByLabel(/^Reason/).fill("MoU signed with Skilient on 1 October");
    await assign.getByRole("button", { name: "Make owner" }).click();
    await expect(page.getByText(`Owner: Rida Registrar ${tag}`)).toBeVisible();
    await expect(page.getByTestId("uni-admins")).toContainText("owner");

    const add = page.getByTestId("add-domain");
    await add.getByLabel("Domain").fill(`students.${uniDomain}`);
    await add.getByLabel("For").selectOption("student");
    await add.getByLabel("Reason").fill("Student mail server");
    await add.getByRole("button", { name: "Add domain" }).click();
    await expect(page.getByTestId("uni-domains")).toContainText(`students.${uniDomain}`);
    await expect(page.getByTestId("uni-domains")).toContainText("Skilient staff");

    for (const tab of ["Ecosphere", "Exam calendar", "Invoices"]) {
      await page.getByRole("navigation", { name: "University sections" }).getByRole("link", { name: tab }).click();
      await expect(page.getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
      await axeBothThemes(page, `university ${tab}`);
    }

    const { data: audit } = await db.from("ops_audit_log").select("action").eq("staff_id", staff.id).eq("target_id", uni.id);
    expect(audit!.map((a) => a.action).sort()).toEqual(["uni.domain_add", "uni.owner_assign"]);
    expect(problems).toEqual([]);
  });
});
