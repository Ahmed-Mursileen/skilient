/**
 * What PostHog may see from the browser (PRD 10 "Session replays and heatmaps", "Privacy rules";
 * phase 13 questions 2 and 5). Pure functions, client-safe and unit-tested.
 *
 * - URLs lose their query string and fragment (tokens, emails in /signup?email=, search terms), and
 *   path segments that name a person (/profile/<username>, /cv/<username>) or a CV (/verify/<code>)
 *   are replaced.
 * - Page titles are dropped (a profile's title is a name).
 * - Replays: all text and inputs masked, user-uploaded images blocked; some routes are never recorded.
 * - Heatmaps are kept only on the pages PRD 10 names.
 * - Only page views, identify, replays, heatmaps and the named landing events leave the browser.
 */

import { CLIENT_EVENTS } from "@/lib/analytics/events";

/** Routes that are never recorded: the PRD list plus every page that shows a secret, token or code. */
const NEVER_RECORDED: RegExp[] = [
  /^\/chat(\/|$)/,
  /^\/ventures\/[^/]+\/chat(\/|$)/,
  /^\/ops(\/|$)/,
  /^\/signin(\/|$)/,
  /^\/signup(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/reset-password(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/settings\/(billing|security|account)(\/|$)/,
  /^\/billing(\/|$)/,
  /^\/(org|uni)\/billing(\/|$)/,
  /^\/(org|uni)\/join(\/|$)/,
  /^\/uni\/claim(\/|$)/,
  /^\/fairs\/invite(\/|$)/,
  /^\/cv\//,
  /^\/verify\/./,
  /^\/request-university\/(confirm|unsubscribe)(\/|$)/,
  /^\/events\/[^/]+\/(check-in|attend)(\/|$)/,
  /^\/ui(\/|$)/,
];

/** PRD 10: heatmaps on marketing pages, Home, Opportunities and onboarding. */
const HEATMAP_PAGES: RegExp[] = [
  /^\/$/,
  /^\/(recruiters|universities|faculty|pricing|about|request-university|verify)$/,
  /^\/feed$/,
  /^\/opportunities(\/[^/]+)?$/,
  /^\/onboarding(\/|$)/,
];

/**
 * The only events the browser may send (PRD 10: named events only). Anything else posthog-js might
 * produce if a project setting turned it on (autocapture, dead clicks, exceptions, web vitals) is
 * dropped here.
 */
const ALLOWED_EVENTS = new Set<string>(["$pageview", "$identify", "$snapshot", "$$heatmap", ...CLIENT_EVENTS]);

/** Path segments that would name a person or a CV, replaced before anything is sent. */
const NAMED_SEGMENTS: [RegExp, string][] = [
  [/^\/profile\/[^/]+/, "/profile/:username"],
  [/^\/cv\/[^/]+/, "/cv/:username"],
  [/^\/verify\/[^/]+/, "/verify/:code"],
];

export function isRecordingBlocked(pathname: string): boolean {
  return NEVER_RECORDED.some((re) => re.test(pathname));
}

export function isHeatmapPage(pathname: string): boolean {
  return HEATMAP_PAGES.some((re) => re.test(pathname));
}

export function scrubPath(pathname: string): string {
  for (const [re, replacement] of NAMED_SEGMENTS) {
    if (re.test(pathname)) return pathname.replace(re, replacement);
  }
  return pathname;
}

/**
 * A URL as PostHog may store it: origin and scrubbed path only. Relative paths stay relative.
 * Anything that doesn't parse is dropped.
 */
export function scrubUrl(value: string): string | null {
  const relative = value.startsWith("/");
  let url: URL;
  try {
    url = new URL(value, "https://relative.invalid");
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const path = scrubPath(url.pathname);
  return relative ? path : `${url.origin}${path}`;
}

const URL_LIKE = /^(https?:\/\/|\/)/;
const EMAIL_LIKE = /@/;
const DROPPED_KEYS = new Set(["title", "$title", "$el_text", "$elements_chain"]);

/** Scrubs one flat property bag (event properties, `$set`, `$set_once`). */
export function scrubProperties(props: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!props) return props;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (DROPPED_KEYS.has(key)) continue;
    if (typeof value === "string") {
      if (URL_LIKE.test(value)) {
        const scrubbed = scrubUrl(value);
        if (scrubbed !== null) out[key] = scrubbed;
        continue;
      }
      if (EMAIL_LIKE.test(value)) continue;
    }
    out[key] = value;
  }
  return out;
}

interface SnapshotItem {
  type?: number;
  data?: { href?: unknown; payload?: { href?: unknown } };
}

/** Recordings carry the page URL in their meta events; scrub it like any other URL. */
function scrubSnapshot(data: unknown): void {
  if (!Array.isArray(data)) return;
  for (const item of data as SnapshotItem[]) {
    if (item?.data && typeof item.data.href === "string") item.data.href = scrubUrl(item.data.href) ?? "";
    if (item?.data?.payload && typeof item.data.payload.href === "string") {
      item.data.payload.href = scrubUrl(item.data.payload.href) ?? "";
    }
  }
}

/** The shape of posthog-js's `before_send` argument that this module touches. */
export interface OutgoingEvent {
  event: string;
  properties: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/**
 * posthog-js `before_send`: returns the event to send, or null to drop it. `pathname` is the page
 * the browser is on now.
 */
export function scrubEvent<T extends OutgoingEvent>(event: T | null, pathname: string): T | null {
  if (!event || !ALLOWED_EVENTS.has(event.event)) return null;
  if (event.event === "$$heatmap") {
    if (!isHeatmapPage(pathname)) return null;
    // Heatmap data is keyed by page URL.
    const data = event.properties.$heatmap_data;
    if (data && typeof data === "object") {
      const byPage: Record<string, unknown[]> = {};
      for (const [url, points] of Object.entries(data as Record<string, unknown>)) {
        const key = scrubUrl(url);
        if (key !== null && Array.isArray(points)) byPage[key] = [...(byPage[key] ?? []), ...points];
      }
      event.properties.$heatmap_data = byPage;
    }
  }
  if (event.event === "$snapshot") {
    if (isRecordingBlocked(pathname)) return null;
    scrubSnapshot(event.properties.$snapshot_data);
    return event;
  }
  event.properties = scrubProperties(event.properties) ?? {};
  for (const key of ["$set", "$set_once"] as const) {
    const nested = event.properties[key];
    if (nested && typeof nested === "object") event.properties[key] = scrubProperties(nested as Record<string, unknown>);
    if (event[key]) event[key] = scrubProperties(event[key]);
  }
  return event;
}

/** Attributes that carry readable text (a photo's alt is a name, a link's label too). */
const TEXT_ATTRIBUTES = new Set([
  "alt",
  "title",
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "aria-roledescription",
  "placeholder",
  "content",
  "value",
  "label",
  "download",
]);
const URL_ATTRIBUTES = new Set(["href", "action", "formaction", "cite"]);

/**
 * Replay attributes: text-bearing ones masked like text, link targets scrubbed like any URL
 * (/profile/<username> becomes /profile/:username). Layout attributes (class, style, id) stay, so a
 * replay still shows the page.
 */
export function maskAttribute(name: string, value: string): string {
  if (TEXT_ATTRIBUTES.has(name)) return value.replace(/\S/g, "*");
  if (URL_ATTRIBUTES.has(name)) return URL_LIKE.test(value) ? (scrubUrl(value) ?? "") : value.startsWith("#") ? value : "";
  return value;
}

/**
 * Replay privacy (questions 2): every text node, input and text-bearing attribute masked, every
 * user-uploaded image (served from Supabase Storage, directly or through next/image) and anything
 * marked `data-ph-block` blocked, head metadata and scripts left out.
 */
export const REPLAY_PRIVACY = {
  maskAllInputs: true,
  maskTextSelector: "*",
  maskAttributeFn: maskAttribute,
  blockSelector: 'img[src*="/storage/v1/"], img[src*="%2Fstorage%2Fv1%2F"], img[srcset*="%2Fstorage%2Fv1%2F"], [data-ph-block]',
  slimDOMOptions: "all",
  captureJsonLd: false,
  recordHeaders: false,
  recordBody: false,
  captureCanvas: { recordCanvas: false },
} as const;

/** PRD 10: 20% of sessions are recorded. */
export const REPLAY_SAMPLE_RATE = 0.2;
