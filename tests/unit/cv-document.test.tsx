import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CvDocument } from "@/components/cv/cv-document";
import { cvDate, cvDocumentHtml, CV_TEMPLATES, cvCss, type CvDocumentInput } from "@/lib/cv/document";
import { FULL_SNAPSHOT } from "@/lib/cv/sample";

describe("CV document", () => {
  it("escapes every value from the snapshot", () => {
    const evil = `<script>alert(1)</script>"'&`;
    const s = structuredClone(FULL_SNAPSHOT);
    s.person.name = evil;
    s.person.department = evil;
    s.summary = evil;
    s.skills[0].name = evil;
    s.projects[0].title = evil;
    s.projects[0].description = evil;
    s.projects[0].repository = evil;
    s.open_source[0].repository = evil;
    s.endorsements[0].note = evil;
    s.endorsements[0].endorser = evil;
    s.credentials[0].title = evil;
    s.education.university = evil;
    const html = cvDocumentHtml({ snapshot: s, code: "ABCDE12345", issuedAt: "2026-10-01T19:30:00Z", template: "standard", siteUrl: "https://skilient.com" });
    expect(html).not.toContain("<script");
    expect(html).not.toContain(`"'&<`);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#x27;&amp;");
    // The web renderer (React) escapes the same way and draws the same markup.
    const input: CvDocumentInput = { snapshot: s, code: "ABCDE12345", issuedAt: "2026-10-01T19:30:00Z", template: "standard", siteUrl: "https://skilient.com" };
    expect(renderToStaticMarkup(<CvDocument {...input} />)).toBe(cvDocumentHtml(input));
  });

  it("web and PDF markup are identical for every template, with and without the QR code", () => {
    for (const template of CV_TEMPLATES) {
      for (const qrDataUri of [undefined, "data:image/svg+xml;base64,PHN2Zy8+"]) {
        const input: CvDocumentInput = { snapshot: FULL_SNAPSHOT, code: "ABCDE12345", issuedAt: "2026-10-01T19:30:00Z", template, siteUrl: "https://skilient.com", qrDataUri };
        expect(renderToStaticMarkup(<CvDocument {...input} />), template).toBe(cvDocumentHtml(input));
      }
    }
    const partial = { ...FULL_SNAPSHOT, credentials: [], endorsements: [], standing: { tier: null, top_percent: null }, person: { ...FULL_SNAPSHOT.person, email: "a@nutech.edu.pk" } };
    const input: CvDocumentInput = { snapshot: partial, code: "ABCDE12345", issuedAt: "2026-10-01T19:30:00Z", template: "modern", siteUrl: "https://skilient.com" };
    expect(renderToStaticMarkup(<CvDocument {...input} />)).toBe(cvDocumentHtml(input));
  });

  it("leaves out empty sections and keeps the chosen order", () => {
    const s = { ...FULL_SNAPSHOT, credentials: [], sections: ["credentials", "education", "skills"] as typeof FULL_SNAPSHOT.sections };
    const html = cvDocumentHtml({ snapshot: s, code: "ABCDE12345", issuedAt: "2026-10-01T19:30:00Z", template: "compact", siteUrl: "https://skilient.com/" });
    expect(html).not.toContain(">Credentials<");
    expect(html.indexOf(">Education<")).toBeLessThan(html.indexOf(">Skills<"));
    expect(html).not.toContain(">Summary<");
    expect(html).toContain("https://skilient.com/verify/ABCDE12345");
    expect(html).toContain("ABCDE-12345");
  });

  it("formats dates and has CSS for every template", () => {
    expect(cvDate("2026-06")).toBe("Jun 2026");
    expect(cvDate("2026-09-05")).toBe("5 Sep 2026");
    expect(cvDate(null)).toBe("");
    for (const t of CV_TEMPLATES) expect(cvCss(t)).toContain("font-variant-ligatures: none");
  });
});
