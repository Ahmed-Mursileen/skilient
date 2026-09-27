import { createHmac, randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * E2E fixtures against the local Supabase stack (CI exports these from `supabase status`).
 * The secret key is the local stack's development key and is used only by the tests,
 * to create accounts through the Auth admin API (PRD 10: seeded test users).
 */
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SECRET_KEY = process.env.E2E_SUPABASE_SECRET_KEY ?? "";
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

export const hasBackend = Boolean(SUPABASE_URL && SECRET_KEY);

let admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  admin ??= createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export function uniqueEmail(domain: "nutech.edu.pk" | "nu.edu.pk", tag = "e2e"): string {
  return `${tag}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}@${domain}`;
}

export const PASSWORD = "Skilient-e2e-Passw0rd!";

export interface TestStudent {
  id: string;
  email: string;
  password: string;
  fullName: string;
  username: string;
}

/** A confirmed student, optionally onboarded and with the agreement accepted. */
export async function createStudent(opts: {
  domain: "nutech.edu.pk" | "nu.edu.pk";
  fullName: string;
  onboarded?: boolean;
  agreement?: boolean;
}): Promise<TestStudent> {
  const email = uniqueEmail(opts.domain);
  const db = adminClient();
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: opts.fullName },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const id = data.user.id;
  const username = `e2e_${randomBytes(5).toString("hex")}`;
  if (opts.agreement ?? true) {
    const { error: e } = await db.from("agreement_acceptances").insert({ user_id: id, version: 1 });
    if (e) throw new Error(`agreement: ${e.message}`);
  }
  if (opts.onboarded ?? true) {
    const { error: e } = await db
      .from("profiles")
      .update({ username, department: "Computer Science", graduation_year: 2027, onboarding_complete: true })
      .eq("user_id", id);
    if (e) throw new Error(`profile: ${e.message}`);
  }
  return { id, email, password: PASSWORD, fullName: opts.fullName, username };
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
  Created: string;
}

/** Newest email to `address` (after `since`), polling Mailpit for up to 20 s. */
export async function latestEmail(address: string, since = 0): Promise<{ subject: string; html: string; text: string }> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: MailpitMessage[] };
      const fresh = messages.filter((m) => new Date(m.Created).getTime() >= since);
      if (fresh.length) {
        const newest = fresh.sort((a, b) => b.Created.localeCompare(a.Created))[0];
        const detail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`)).json()) as {
          Subject: string;
          HTML: string;
          Text: string;
        };
        return { subject: detail.Subject, html: detail.HTML, text: detail.Text };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email for ${address}`);
}

export function codeFrom(subject: string): string {
  const code = /(\d{6})/.exec(subject)?.[1];
  if (!code) throw new Error(`No code in "${subject}"`);
  return code;
}

/** The token_hash link in an email body (HTML-escaped ampersands undone). */
export function linkFrom(html: string, type: string): string {
  const match = new RegExp(`href="([^"]*token_hash=[^"]*type=${type})"`).exec(html);
  if (!match) throw new Error(`No ${type} link in email`);
  return match[1].replace(/&amp;/g, "&");
}

// --- RFC 6238 TOTP for the two-factor flow -------------------------------------------

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(c);
    if (v === -1) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

// --- UI helpers ------------------------------------------------------------------------

/**
 * Signs in through the form and waits until the server action has redirected away from
 * /signin (to the feed, onboarding, the agreement or the two-factor step), so a following
 * page.goto() can't cancel the sign-in mid-flight.
 */
export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/signin");
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/signin");
}

/** Collects CSP violations and page errors so a test can assert there were none. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

export async function expectNoResidue(page: Page, other: TestStudent) {
  const html = await page.content();
  expect(html).not.toContain(other.fullName);
  expect(html).not.toContain(other.email);
  expect(html).not.toContain(other.username);
}
