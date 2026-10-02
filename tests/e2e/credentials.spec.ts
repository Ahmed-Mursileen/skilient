import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStudent, hasBackend, signInWithPassword, totp, watchConsole, type TestStudent } from "./support";

/**
 * Phase 4 slice 3 (PRD 5.19, 5.26): a student adds a PDF and a photo of a certificate (the
 * photo's EXIF is stripped); a trust reviewer on two-factor claims each in /ops/evidence,
 * approves one as a recognised issuer and rejects the other with a reason; the student and
 * a classmate see the outcome. Files stay private to the student and the reviewer.
 */
test.describe("Credentials", () => {
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

  const PDF = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );

  async function fill(page: Page, title: string, issuer: string) {
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Issued by").fill(issuer);
    await page.getByLabel("Issued on").fill("2026-03-15");
  }

  test("upload, staff review in /ops, outcome on the profile; files stay private", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    const tag = Date.now().toString(36);
    const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Sana Certified" });
    const classmate = await createStudent({ domain: "nutech.edu.pk", fullName: "Kamran Classmate" });
    const reviewer = await createStudent({ domain: "nutech.edu.pk", fullName: "Tahir Trust" });
    const db = adminClient();
    await db.from("staff_roles").insert({ user_id: reviewer.id, role: "trust_reviewer", granted_by: reviewer.id });

    // The student adds a PDF and a photo with EXIF, and a fake "PDF" that is refused.
    await signInWithPassword(page, student.email, student.password);
    await page.goto("/me/credentials");
    await expect(page.getByRole("heading", { level: 1, name: "Credentials" })).toBeVisible();
    await expect(page.getByText("No credentials yet")).toBeVisible();
    await axe(page, "credentials (empty)");

    await page.getByLabel("Certificate file").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf at all") });
    await fill(page, `Fake ${tag}`, "Nobody");
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Choose a PDF up to 5 MB.")).toBeVisible();

    await page.getByLabel("Certificate file").setInputFiles({ name: "aws.pdf", mimeType: "application/pdf", buffer: PDF });
    await fill(page, `AWS Cloud Practitioner ${tag}`, "Amazon Web Services");
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Sent for review.")).toBeVisible();
    const pdfItem = page.getByRole("listitem", { name: `AWS Cloud Practitioner ${tag}` });
    await expect(pdfItem.getByText("Waiting for review")).toBeVisible();

    const photo = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#e8e0d0" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "Sana", Make: "PhoneCam" } })
      .toBuffer();
    await page.getByLabel("Certificate file").setInputFiles({ name: "java.jpg", mimeType: "image/jpeg", buffer: photo });
    await fill(page, `Oracle Java ${tag}`, "Oracle");
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByRole("listitem", { name: `Oracle Java ${tag}` }).getByText("Waiting for review")).toBeVisible();
    await axe(page, "credentials (pending)");

    // Stored privately; the photo was re-encoded without its EXIF; nothing reaches the profile yet.
    const { data: rows } = await db.from("credentials").select("id, title, file_path, file_type").eq("user_id", student.id);
    expect(rows).toHaveLength(2);
    const imageRow = rows!.find((r) => r.file_type === "image")!;
    const pdfRow = rows!.find((r) => r.file_type === "pdf")!;
    const stored = await db.storage.from("credentials").download(imageRow.file_path);
    const meta = await sharp(Buffer.from(await stored.data!.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    const classmateApi = await apiAs(classmate);
    expect((await classmateApi.storage.from("credentials").download(pdfRow.file_path)).error).not.toBeNull();
    expect((await classmateApi.rpc("review_credential", { p_id: pdfRow.id, p_approve: true, p_reason: "mine now" })).error?.code).toBe("42501");
    expect((await classmateApi.rpc("credentials_for", { p_user: student.id })).data).toEqual([]);

    // The reviewer turns on two-factor and works the evidence queue.
    const tPage = await (await browser.newContext()).newPage();
    await signInWithPassword(tPage, reviewer.email, reviewer.password);
    await tPage.goto("/settings/security");
    await tPage.getByRole("button", { name: "Set up two-factor" }).click();
    const secret = (await tPage.locator("code").first().textContent())?.trim() ?? "";
    await tPage.getByLabel("Code from the app").fill(totp(secret));
    await tPage.getByRole("button", { name: "Confirm" }).click();
    await tPage.getByRole("checkbox", { name: "I've saved these codes" }).check();
    await tPage.getByRole("button", { name: "Done" }).click();
    // The inbox lists the pending credential; the Evidence area has the full queue.
    await tPage.goto("/ops");
    await expect(tPage.getByTestId("inbox-item").filter({ hasText: `AWS Cloud Practitioner ${tag}` })).toBeVisible();
    await tPage.goto("/ops/evidence");
    await expect(tPage.getByTestId("storage-use")).toContainText("of 1 GB");
    const queue = tPage.getByTestId("credential-queue");
    await expect(queue.getByTestId("credential-row").filter({ hasText: `AWS Cloud Practitioner ${tag}` })).toContainText("Nobody yet");
    await axe(tPage, "ops evidence");

    await queue.getByRole("link", { name: `AWS Cloud Practitioner ${tag}` }).click();
    await expect(tPage.getByRole("heading", { level: 1, name: `AWS Cloud Practitioner ${tag}` })).toBeVisible();
    await expect(tPage.getByRole("link", { name: /Open the file/ })).toHaveAttribute("href", /\/storage\/v1\/object\/sign\/credentials\//);
    await tPage.getByRole("button", { name: "Claim" }).click();
    await tPage.getByRole("radio", { name: /Approve/ }).check();
    await expect(tPage.getByLabel("Recognised issuer", { exact: true })).toHaveValue("aws");
    await tPage.getByRole("textbox", { name: "Reason" }).fill("Verified on the issuer's badge site");
    await axe(tPage, "ops credential");
    await tPage.getByRole("button", { name: "Save decision" }).click();
    await expect(tPage.getByRole("heading", { level: 2, name: "Approved" })).toBeVisible();

    await tPage.goto(`/ops/evidence/credentials/${imageRow.id}`);
    await expect(tPage.getByRole("img", { name: `The uploaded certificate: Oracle Java ${tag}` })).toBeVisible();
    await tPage.getByRole("button", { name: "Claim" }).click();
    await tPage.getByRole("radio", { name: /Reject/ }).check();
    await tPage.getByRole("textbox", { name: "Reason" }).fill("The name on the certificate doesn't match your profile");
    await tPage.getByRole("button", { name: "Save decision" }).click();
    await expect(tPage.getByRole("heading", { level: 2, name: "Not approved" })).toBeVisible();
    const { data: audit } = await db.from("ops_audit_log").select("action, reason").eq("staff_id", reviewer.id).order("action");
    expect(audit!.map((a) => a.action)).toEqual(["credential.approve", "credential.claim", "credential.claim", "credential.reject"]);

    // The student sees both outcomes; a classmate sees the approved one on the profile.
    await page.reload();
    await expect(pdfItem.getByText("Approved")).toBeVisible();
    await expect(pdfItem.getByText("Recognised issuer: counts 1.5× in your score.")).toBeVisible();
    await expect(page.getByText("The name on the certificate doesn't match your profile")).toBeVisible();
    const cPage = await (await browser.newContext()).newPage();
    await signInWithPassword(cPage, classmate.email, classmate.password);
    await cPage.goto(`/profile/${student.username}`);
    const section = cPage.getByRole("region", { name: "Credentials" });
    await expect(section.getByText(`AWS Cloud Practitioner ${tag}`)).toBeVisible();
    await expect(section.getByText("Amazon Web Services (AWS)")).toBeVisible();
    await expect(section.getByText(`Oracle Java ${tag}`)).toHaveCount(0);

    // Deleting removes it everywhere.
    await pdfItem.getByRole("button", { name: `Delete AWS Cloud Practitioner ${tag}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    // The open dialog hides the list from assistive tech, so wait for it to close first.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(`AWS Cloud Practitioner ${tag}`)).toHaveCount(0);
    await cPage.reload();
    await expect(cPage.getByText(`AWS Cloud Practitioner ${tag}`)).toHaveCount(0);

    expect(problems).toEqual([]);
  });
});
