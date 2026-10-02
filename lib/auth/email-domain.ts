/**
 * University detection from an email address (PRD 5.27). Shared by the signup form
 * (instant feedback from the cached domain list) and the server actions (authoritative
 * check before calling Supabase Auth, which the before-user-created hook repeats).
 */

export interface UniversityRef {
  id: string;
  name: string;
}

/** A university in the public directory. */
export interface DirectoryUniversity extends UniversityRef {
  /** Students and faculty can sign up here now (universities.live_at has passed). */
  live: boolean;
}

/** The public domain list served by /api/universities/domains. */
export interface DomainDirectory {
  /** Domain → universities that own it (usually one; a few domains are shared). */
  domains: Record<string, DirectoryUniversity[]>;
  /** Webmail domains refused with "Use your university email". */
  personal: string[];
}

export type Detection =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "personal"; domain: string }
  | { kind: "unknown"; domain: string }
  /** A known university, but none behind this domain is live yet ("Request it", PRD 5.1). */
  | { kind: "not_live"; domain: string; universities: DirectoryUniversity[] }
  | { kind: "match"; domain: string; universities: DirectoryUniversity[] };

const EMAIL_RE = /^[^\s@]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The lower-cased domain of a well-formed address, else null. */
export function emailDomain(email: string): string | null {
  return EMAIL_RE.exec(normalizeEmail(email))?.[1] ?? null;
}

/**
 * `requireLive` (students and faculty) narrows a match to live universities, or reports
 * `not_live`; university officials sign up before their university opens, so they pass false.
 */
export function detectUniversity(email: string, directory: DomainDirectory, { requireLive = true } = {}): Detection {
  if (!email.trim()) return { kind: "empty" };
  const domain = emailDomain(email);
  if (!domain) return { kind: "invalid" };
  if (directory.personal.includes(domain)) return { kind: "personal", domain };
  const universities = directory.domains[domain];
  if (!universities?.length) return { kind: "unknown", domain };
  if (!requireLive) return { kind: "match", domain, universities };
  const live = universities.filter((u) => u.live);
  if (!live.length) return { kind: "not_live", domain, universities };
  return { kind: "match", domain, universities: live };
}

/** "FAST-NUCES" for one university, a generic phrase when a domain is shared. */
export function universityLabel(universities: UniversityRef[]): string {
  return universities.length === 1 ? universities[0].name : "Your university";
}

/** User-facing line for each detection result (quoted strings from PRD 5.27). */
export function detectionMessage(detection: Detection): string | null {
  switch (detection.kind) {
    case "personal":
      return "Use your university email.";
    case "unknown":
      return "Your university isn't on Skilient yet.";
    case "not_live":
      return `${universityLabel(detection.universities)} isn't on Skilient yet.`;
    case "invalid":
      return "Enter a valid email address.";
    default:
      return null;
  }
}
