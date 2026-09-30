import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import { CV_TEMPLATES, SECTION_HEADINGS } from "@/lib/cv/document";
import { renderCvPdf } from "@/lib/cv/pdf";
import { FULL_SNAPSHOT } from "@/lib/cv/sample";

/**
 * PRD 5.18 "ATS check": each template is printed to PDF and its text extracted as an
 * applicant-tracking system would; the standard headings come in the snapshot's order and
 * every skill and project title is there as real text, with the verify code.
 */
async function textOf(pdf: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: Buffer.from(pdf) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

/** Extracted text joins lines and may break words across them; compare on single spaces. */
function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}

describe.each(CV_TEMPLATES)("ATS text: %s template", (template) => {
  it("keeps headings, order, skills, projects and the code as text", async () => {
    const pdf = await renderCvPdf({
      snapshot: FULL_SNAPSHOT,
      code: "ABCDE12345",
      issuedAt: "2026-10-01T19:30:00Z",
      template,
      siteUrl: "https://skilient.com",
      paper: "a4",
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    const text = flat(await textOf(pdf));

    let last = -1;
    for (const section of FULL_SNAPSHOT.sections) {
      const at = text.indexOf(SECTION_HEADINGS[section], last + 1);
      expect(at, `heading "${SECTION_HEADINGS[section]}" after position ${last}`).toBeGreaterThan(last);
      last = at;
    }
    for (const skill of FULL_SNAPSHOT.skills) expect(text).toContain(skill.name);
    for (const project of FULL_SNAPSHOT.projects) expect(text).toContain(project.title);
    expect(text).toContain(FULL_SNAPSHOT.person.name);
    expect(text).toContain("ABCDE-12345");
    expect(text).toContain("https://skilient.com/verify/ABCDE12345");
    // Ligatures off: "fi" and "fl" stay two letters an ATS can search for.
    expect(text).toContain("finds free slots");
    expect(text).toContain("Flare tier");
  });
});

it("follows the student's section order", async () => {
  const pdf = await renderCvPdf({
    snapshot: { ...FULL_SNAPSHOT, sections: ["education", "skills", "summary"] },
    code: "ABCDE12345",
    issuedAt: "2026-10-01T19:30:00Z",
    template: "standard",
    siteUrl: "https://skilient.com",
    paper: "letter",
  });
  const text = flat(await textOf(pdf));
  const at = (h: string) => text.indexOf(h);
  expect(at("Education")).toBeLessThan(at("Skills"));
  expect(at("Skills")).toBeLessThan(at("Summary"));
  expect(text).not.toContain("Open-source work");
});
