import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { createStudent, hasBackend, signInWithPassword, watchConsole } from "./support";

/**
 * PostHog in the browser (PRD 10; phase 13 slice 1), against the second test server, which runs the
 * same build with a PostHog project key (playwright.config.ts). PostHog itself is faked at /ingest:
 * its remote config turns replays on, its scripts come from the installed posthog-js, and every
 * payload is decoded and checked. Checks: named events only, no personal data, PostHog only on our
 * own origin, replays masked, nothing recorded on chat, and the CSP stays clean with PostHog and its
 * recorder loaded.
 */
const ANALYTICS_URL = `http://127.0.0.1:${Number(process.env.PORT ?? 3100) + 1}`;
const KEY = "phc_e2e";
// A session the 20% sample would have to pick by chance; seeded as already sampled so every run records.
const SESSION = "01a10371-19f2-755f-a7b9-44d388931815";
const ALLOWED = new Set(["$pageview", "$identify", "$snapshot", "$$heatmap", "signup_start", "uni_detected", "uni_not_live", "uni_requested", "org_cta_click"]);

test.skip(!!process.env.E2E_BASE_URL, "needs the local analytics server");
test.use({ baseURL: ANALYTICS_URL });

interface Sent {
  event: string;
  properties: Record<string, unknown>;
  $set?: Record<string, unknown>;
}

interface FakePostHog {
  events: Sent[];
  /** Every payload as sent, decoded, plus each replay snapshot decompressed. */
  wire: string[];
  snapshots: { href: string | null; data: string }[];
  /** PostHog scripts the page loaded (the recorder is `lazy-recorder.js`). */
  scripts: string[];
  outsideRequests: string[];
}

async function fakePostHog(page: Page): Promise<FakePostHog> {
  const fake: FakePostHog = { events: [], wire: [], snapshots: [], scripts: [], outsideRequests: [] };
  await page.addInitScript(
    ({ key, session }) => {
      // posthog-js drops events from automated browsers; this page must look like a person's.
      // It checks navigator.webdriver and the userAgentData brands (headless Chromium lists "HeadlessChrome").
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
      Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });
      const store = `ph_${key}_posthog`;
      if (!localStorage.getItem(store)) {
        localStorage.setItem(store, JSON.stringify({ $sesid: [Date.now(), session, Date.now()], $session_is_sampled: session, $replay_sample_rate: 0.2 }));
      }
    },
    { key: KEY, session: SESSION },
  );
  page.on("request", (request) => {
    if (/posthog\.com/.test(request.url())) fake.outsideRequests.push(request.url());
  });
  await page.route("**/ingest/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith("/ingest/static/")) {
      const name = url.pathname.split("/").pop()!;
      fake.scripts.push(name);
      const file = `node_modules/posthog-js/dist/${name}`;
      return existsSync(file)
        ? route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(file) })
        : route.fulfill({ status: 404 });
    }
    if (url.pathname.endsWith("/config.js")) return route.fulfill({ status: 404 });
    if (url.pathname.endsWith("/config")) {
      return route.fulfill({ json: { token: KEY, sessionRecording: { endpoint: "/s/" }, heatmaps: true } });
    }
    const body = request.postDataBuffer();
    if (body) {
      const text = decodeBody(body);
      fake.wire.push(text);
      const parsed = JSON.parse(text) as { batch?: Sent[] } | Sent[] | Sent;
      const events = Array.isArray(parsed) ? parsed : "batch" in parsed && parsed.batch ? parsed.batch : [parsed as Sent];
      for (const event of events) {
        fake.events.push(event);
        if (event.event !== "$snapshot") continue;
        for (const item of event.properties.$snapshot_data as { type: number; data: unknown }[]) {
          const data = typeof item.data === "string" ? gunzipSync(Buffer.from(item.data, "latin1")).toString() : JSON.stringify(item.data);
          const href = item.type === 4 ? ((item.data as { href?: string }).href ?? null) : null;
          fake.snapshots.push({ href, data });
          fake.wire.push(data);
        }
      }
    }
    return route.fulfill({ json: { status: 1 } });
  });
  return fake;
}

/** posthog-js sends gzip, JSON, or (on page unload, by beacon) a form field of base64 JSON. */
function decodeBody(body: Buffer): string {
  if (body[0] === 0x1f) return gunzipSync(body).toString();
  const text = body.toString();
  if (!text.startsWith("data=")) return text;
  const decoded = Buffer.from(decodeURIComponent(text.slice(5)), "base64");
  return decoded[0] === 0x1f ? gunzipSync(decoded).toString() : decoded.toString();
}

const names = (fake: FakePostHog) => fake.events.map((e) => e.event);
/** posthog-js sends a replay's first snapshot some seconds in; activity helps it along. */
const REPLAY_WAIT = 60_000;

test.describe.configure({ timeout: 120_000 });

test("landing: named events only, no personal data, PostHog on our own origin, masked replay, clean CSP", async ({ page }) => {
  const fake = await fakePostHog(page);
  const problems = watchConsole(page);
  await page.goto("/");
  const headline = (await page.locator("h1").first().innerText()).split(/\s+/).slice(0, 3).join(" ");

  await page.getByLabel("University email").first().fill("someone.private@nutech.edu.pk");
  await expect.poll(() => names(fake), { timeout: 20_000 }).toContain("uni_detected");
  await page.mouse.wheel(0, 600);
  await expect.poll(() => fake.snapshots.length, { timeout: REPLAY_WAIT }).toBeGreaterThan(0);

  for (const name of names(fake)) expect(ALLOWED.has(name), name).toBe(true);
  const detected = fake.events.find((e) => e.event === "uni_detected")!;
  expect(detected.properties).toMatchObject({ source: "hero" });
  expect(detected.properties.university_id).toMatch(/^[0-9a-f-]{36}$/);
  const pageview = fake.events.find((e) => e.event === "$pageview")!;
  expect(pageview.properties).not.toHaveProperty("title");

  const wire = fake.wire.join("\n");
  expect(wire).not.toContain("someone.private");
  expect(wire).not.toContain(headline);
  expect(fake.snapshots.some((s) => s.data.includes("****"))).toBe(true);
  expect(fake.outsideRequests).toEqual([]);
  expect(problems).toEqual([]);
});

test("signed in: identified by uuid only, and nothing recorded on chat", async ({ page }) => {
  test.skip(!hasBackend, "needs the local Supabase stack");
  const student = await createStudent({ domain: "nutech.edu.pk", fullName: "Analytics Person" });
  const fake = await fakePostHog(page);
  const problems = watchConsole(page);
  await signInWithPassword(page, student.email, student.password);
  await page.goto("/feed");

  await expect.poll(() => names(fake), { timeout: 20_000 }).toContain("$identify");
  const identify = fake.events.find((e) => e.event === "$identify")!;
  expect(identify.properties.distinct_id).toBe(student.id);
  const traits = identify.$set ?? (identify.properties.$set as Record<string, unknown>);
  expect(Object.keys(traits).sort()).toEqual(["role", "university_id"]);
  expect(traits.role).toBe("student");
  // The feed is recorded (this session is in the sample): the recorder is running.
  await expect.poll(() => fake.scripts, { timeout: 20_000 }).toContain("lazy-recorder.js");

  // Into chat by a client-side navigation: recording pauses, and nothing is sent from chat.
  const before = fake.events.length;
  await page.getByRole("link", { name: "Chat" }).first().click();
  await page.waitForURL(/\/chat/);
  await page.waitForTimeout(8_000);
  // And by a full page load: the recorder never starts there.
  await page.goto("/chat");
  await page.waitForTimeout(5_000);
  expect(fake.events.slice(before).filter((e) => e.event === "$snapshot")).toEqual([]);
  expect(fake.snapshots.some((s) => s.href?.includes("/chat"))).toBe(false);
  expect(names(fake)).toContain("$pageview");

  const wire = fake.wire.join("\n");
  for (const secret of [student.email, student.fullName, student.username]) expect(wire).not.toContain(secret);
  for (const name of names(fake)) expect(ALLOWED.has(name), name).toBe(true);
  expect(fake.outsideRequests).toEqual([]);
  expect(problems).toEqual([]);
});
