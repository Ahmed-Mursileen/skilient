/**
 * The verified CV document (PRD 5.18): one single-column HTML structure with standard
 * headings, used by the web views and the PDF. Five templates differ only in CSS, so every
 * one keeps the same ATS-readable text (checked by tests/ats). Every value from the snapshot
 * is escaped here. The PDF prints this string; the web pages render components/cv/cv-document.tsx,
 * which a unit test keeps identical to it. Client-safe: no server imports.
 */
import type { CvSection, CvSnapshotV1 } from "./types";

export const CV_TEMPLATES = ["standard", "classic", "compact", "modern", "academic"] as const;
export type CvTemplate = (typeof CV_TEMPLATES)[number];

export const TEMPLATE_INFO: Record<CvTemplate, { name: string; pro: boolean; description: string }> = {
  standard: { name: "Standard", pro: false, description: "Spectral headings, Barlow text, a vermillion rule." },
  classic: { name: "Classic", pro: true, description: "Centred header and serif text throughout." },
  compact: { name: "Compact", pro: true, description: "Tighter spacing to fit more on each page." },
  modern: { name: "Modern", pro: true, description: "Large name and a bar beside each heading." },
  academic: { name: "Academic", pro: true, description: "Wide margins and thin rules." },
};

export const SECTION_HEADINGS: Record<CvSection, string> = {
  summary: "Summary",
  skills: "Skills",
  projects: "Projects",
  open_source: "Open-source work",
  endorsements: "Endorsements",
  credentials: "Credentials",
  education: "Education",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROLES: Record<string, string> = {
  lead: "Lead",
  developer: "Developer",
  designer: "Designer",
  researcher: "Researcher",
  other: "Team member",
  former_member: "Former member",
};

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** "2026-06" → "Jun 2026"; "2026-09-25" → "25 Sep 2026". */
export function cvDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  const month = MONTHS[Number(m) - 1] ?? "";
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function tierName(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** Inline text: plain, or bold (a skill, a person, a credential). */
export type Seg = string | { strong: string };
export interface ProjectView {
  title: string;
  meta: string;
  proof: string;
  skills: string | null;
  repository: string | null;
  description: string | null;
}
export type SectionBody = { kind: "p"; text: string } | { kind: "list"; items: Seg[][] } | { kind: "projects"; items: ProjectView[] };
export interface SectionView {
  key: CvSection;
  heading: string;
  body: SectionBody;
}
export interface CvView {
  template: CvTemplate;
  name: string;
  sub: string;
  standing: string | null;
  contact: string;
  sections: SectionView[];
  issuedLine: string;
  checkLine: string;
  qrDataUri: string | null;
}

function sectionBody(s: CvSnapshotV1, section: CvSection): SectionBody | null {
  switch (section) {
    case "summary":
      return s.summary ? { kind: "p", text: s.summary } : null;
    case "skills":
      if (!s.skills.length) return null;
      return {
        kind: "list",
        items: s.skills.map((k) => {
          const e = k.evidence;
          const parts = [
            e.repos && plural(e.repos, "repository", "repositories"),
            e.active_days && plural(e.active_days, "active day"),
            e.pull_requests && plural(e.pull_requests, "merged pull request"),
            e.entries && plural(e.entries, "confirmed contribution"),
            e.endorsements && plural(e.endorsements, "endorsement"),
          ].filter(Boolean);
          return [{ strong: k.name }, `: Level ${k.level}${parts.length ? ` (${parts.join(", ")})` : ""}`];
        }),
      };
    case "projects":
      if (!s.projects.length) return null;
      return {
        kind: "projects",
        items: s.projects.map((p) => {
          const role = [p.owner ? "Creator" : null, ROLES[p.role] ?? "Team member"].filter(Boolean).join(", ");
          const when = p.status === "completed" ? `Completed ${cvDate(p.completed)}` : `In progress${p.started ? ` since ${cvDate(p.started)}` : ""}`;
          const proof = [
            plural(p.verified_entries, "peer-verified contribution"),
            p.faculty_confirmed ? plural(p.faculty_confirmed, "faculty-confirmed entry", "faculty-confirmed entries") : null,
            plural(p.deliverables, "verified deliverable"),
            p.faculty_reviewed ? "Reviewed by faculty" : null,
          ].filter(Boolean);
          return {
            title: p.title,
            meta: [role, p.type.charAt(0).toUpperCase() + p.type.slice(1), when, `Team of ${p.team_size}`].join(" · "),
            proof: proof.join(" · "),
            skills: p.skills.length ? `Skills: ${p.skills.join(", ")}` : null,
            repository: p.repository ? `Repository: ${p.repository}` : null,
            description: p.description || null,
          };
        }),
      };
    case "open_source":
      if (!s.open_source.length) return null;
      return {
        kind: "list",
        items: s.open_source.map((pr) => [
          `${pr.number === null ? `Merged pull request to a ${pr.repository.toLowerCase()}` : `Merged pull request #${pr.number} to ${pr.repository}`}, ${cvDate(pr.merged)}${pr.skills.length ? ` (skills: ${pr.skills.join(", ")})` : ""}`,
        ]),
      };
    case "endorsements":
      if (!s.endorsements.length) return null;
      return {
        kind: "list",
        items: s.endorsements.map((e) => [
          { strong: e.endorser },
          ` endorsed ${e.skill} on ${e.venture}, ${cvDate(e.date)}.${e.note ? ` “${e.note}” (note by ${e.endorser})` : ""}`,
        ]),
      };
    case "credentials":
      if (!s.credentials.length) return null;
      return {
        kind: "list",
        items: s.credentials.map((c) => [
          { strong: c.title },
          `, ${c.issuer}, issued ${cvDate(c.issued)}${c.expires ? `, expires ${cvDate(c.expires)}` : ""}. Checked by Skilient.`,
        ]),
      };
    case "education": {
      const e = s.education;
      const line = [e.university, e.department, e.graduation_year ? `Class of ${e.graduation_year}` : null].filter(Boolean).join(", ");
      // University awards (phase 9) follow the studies; older snapshots have none.
      const awards = s.awards ?? [];
      if (!awards.length) return { kind: "p", text: line };
      return { kind: "list", items: [[line], ...awards.map((a): Seg[] => [{ strong: a.name }, `, awarded by ${a.university}, ${cvDate(a.awarded)}.`])] };
    }
  }
}

export interface CvDocumentInput {
  snapshot: CvSnapshotV1;
  code: string;
  issuedAt: string | Date;
  template: CvTemplate;
  /** Origin printed in the verify link and QR code (NEXT_PUBLIC_SITE_URL). */
  siteUrl: string;
  /** The verify link's QR code as a data: URI (lib/cv/qr.ts); omitted where it isn't needed. */
  qrDataUri?: string;
}

export function verifyUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/$/, "")}/verify/${code}`;
}

/** Everything the document shows, as plain text; both renderers draw exactly this. */
export function cvView(input: CvDocumentInput): CvView {
  const { snapshot: s, code } = input;
  const issued = new Date(input.issuedAt);
  const sections: SectionView[] = [];
  for (const key of s.sections) {
    const body = sectionBody(s, key);
    if (body) sections.push({ key, heading: SECTION_HEADINGS[key], body });
  }
  return {
    template: input.template,
    name: s.person.name,
    sub: [s.person.department, s.person.university, s.person.graduation_year ? `Class of ${s.person.graduation_year}` : null].filter(Boolean).join(" · "),
    standing: s.standing.tier ? `${tierName(s.standing.tier)} tier on Skilient${s.standing.top_percent ? ` · Top ${s.standing.top_percent}%` : ""}` : null,
    contact: s.person.email ? `Email: ${s.person.email}` : "Contact: through Skilient (verify link below)",
    sections,
    issuedLine: `Verified CV issued by Skilient on ${issued.getUTCDate()} ${MONTHS[issued.getUTCMonth()]} ${issued.getUTCFullYear()}. Code ${code.slice(0, 5)}-${code.slice(5)}.`,
    checkLine: `Every item comes from checked evidence. Check this CV at ${verifyUrl(input.siteUrl, code)}`,
    qrDataUri: input.qrDataUri ?? null,
  };
}

function segHtml(segs: Seg[]): string {
  return segs.map((x) => (typeof x === "string" ? esc(x) : `<span class="cv-strong">${esc(x.strong)}</span>`)).join("");
}

function bodyHtml(b: SectionBody): string {
  switch (b.kind) {
    case "p":
      return `<p>${esc(b.text)}</p>`;
    case "list":
      return `<ul>${b.items.map((i) => `<li>${segHtml(i)}</li>`).join("")}</ul>`;
    case "projects":
      return b.items
        .map(
          (p) =>
            `<div class="cv-item"><h3>${esc(p.title)}</h3><p class="cv-meta">${esc(p.meta)}</p><p>${esc(p.proof)}</p>` +
            (p.skills ? `<p>${esc(p.skills)}</p>` : "") +
            (p.repository ? `<p>${esc(p.repository)}</p>` : "") +
            (p.description ? `<p class="cv-desc"><span class="cv-label">Description by the team:</span> ${esc(p.description)}</p>` : "") +
            `</div>`,
        )
        .join("");
  }
}

/** The CV as an <article> (no <html> wrapper), for the PDF. */
export function cvDocumentHtml(input: CvDocumentInput): string {
  const v = cvView(input);
  return (
    `<article class="cvdoc cv-${v.template}" lang="en">` +
    `<header class="cv-head"><h1 class="cv-name">${esc(v.name)}</h1><p class="cv-sub">${esc(v.sub)}</p>` +
    (v.standing ? `<p class="cv-standing">${esc(v.standing)}</p>` : "") +
    `<p class="cv-contact">${esc(v.contact)}</p></header>` +
    v.sections.map((sec) => `<section class="cv-sec cv-sec-${sec.key}"><h2>${esc(sec.heading)}</h2>${bodyHtml(sec.body)}</section>`).join("") +
    `<footer class="cv-foot"><div class="cv-foot-text"><p>${esc(v.issuedLine)}</p><p>${esc(v.checkLine)}</p></div>` +
    (v.qrDataUri ? `<div class="cv-qr"><img src="${esc(v.qrDataUri)}" alt="" width="83" height="83"/></div>` : "") +
    `</footer></article>`
  );
}

const BASE_CSS = `
.cvdoc { --cv-ink: #0e0d0b; --cv-muted: #55524c; --cv-accent: #c03910; --cv-rule: #d9d5ce;
  --cv-display: var(--font-spectral, "Spectral"), Georgia, "Times New Roman", serif;
  --cv-text: var(--font-barlow, "Barlow"), "Helvetica Neue", Arial, sans-serif;
  color: var(--cv-ink); background: #fff; font-family: var(--cv-text); font-size: 10.5pt; line-height: 1.45;
  font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0; text-align: left; }
.cvdoc h1, .cvdoc h2, .cvdoc h3, .cvdoc p, .cvdoc ul { margin: 0; }
.cvdoc .cv-head { margin-bottom: 12pt; }
.cvdoc .cv-name { font-family: var(--cv-display); font-weight: 600; font-size: 22pt; line-height: 1.15; }
.cvdoc .cv-sub, .cvdoc .cv-standing, .cvdoc .cv-contact { color: var(--cv-muted); margin-top: 2pt; }
.cvdoc .cv-sec { margin-top: 12pt; }
.cvdoc h2 { font-family: var(--cv-display); font-weight: 600; font-size: 13pt; padding-bottom: 2pt;
  border-bottom: 1.5pt solid var(--cv-accent); margin-bottom: 6pt; break-after: avoid; }
.cvdoc h3 { font-family: var(--cv-text); font-weight: 600; font-size: 11pt; margin-top: 6pt; break-after: avoid; }
.cvdoc ul { padding-left: 14pt; }
.cvdoc li { margin: 2pt 0; }
.cvdoc .cv-item { break-inside: avoid; margin-bottom: 6pt; }
.cvdoc .cv-item p { margin-top: 1pt; }
.cvdoc .cv-meta { color: var(--cv-muted); }
.cvdoc .cv-strong { font-weight: 600; }
.cvdoc .cv-label { color: var(--cv-muted); font-style: italic; }
.cvdoc .cv-foot { display: flex; gap: 12pt; align-items: flex-end; justify-content: space-between; margin-top: 18pt;
  padding-top: 6pt; border-top: 0.75pt solid var(--cv-rule); color: var(--cv-muted); font-size: 8.5pt; break-inside: avoid; }
.cvdoc .cv-qr { flex: none; width: 22mm; height: 22mm; }
.cvdoc .cv-qr img { width: 100%; height: 100%; display: block; }
`;

const TEMPLATE_CSS: Record<CvTemplate, string> = {
  standard: "",
  classic: `
.cvdoc.cv-classic { font-family: var(--cv-display); font-size: 11pt; }
.cvdoc.cv-classic .cv-head { text-align: center; }
.cvdoc.cv-classic h2 { border-bottom: 0.75pt solid var(--cv-ink); text-align: center; }
.cvdoc.cv-classic h3 { font-family: var(--cv-display); }`,
  compact: `
.cvdoc.cv-compact { font-size: 9.5pt; line-height: 1.3; }
.cvdoc.cv-compact .cv-name { font-size: 18pt; }
.cvdoc.cv-compact .cv-sec { margin-top: 8pt; }
.cvdoc.cv-compact h2 { font-size: 11.5pt; margin-bottom: 3pt; }
.cvdoc.cv-compact .cv-item { margin-bottom: 3pt; }`,
  modern: `
.cvdoc.cv-modern .cv-name { font-size: 28pt; color: var(--cv-accent); }
.cvdoc.cv-modern h2 { border-bottom: 0; border-left: 4pt solid var(--cv-accent); padding: 0 0 0 6pt; }`,
  academic: `
.cvdoc.cv-academic { font-size: 10.5pt; line-height: 1.55; }
.cvdoc.cv-academic .cv-head { text-align: center; border-bottom: 0.75pt solid var(--cv-rule); padding-bottom: 8pt; }
.cvdoc.cv-academic h2 { border-bottom: 0.5pt solid var(--cv-rule); font-weight: 500; }
.cvdoc.cv-academic .cv-sec { margin-top: 14pt; }`,
};

export function cvCss(template: CvTemplate): string {
  return BASE_CSS + TEMPLATE_CSS[template];
}
