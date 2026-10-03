import type { PostHog } from "posthog-js";
import type { ClientEvent, ClientEventProps, IdentifyTraits } from "@/lib/analytics/events";
import { isRecordingBlocked } from "@/lib/analytics/privacy";

/**
 * The browser's handle on PostHog (PRD 10). posthog-js loads lazily (AnalyticsLoader), so calls made
 * before it arrives wait in a short queue. Without a project key (local, CI) every call is a no-op.
 */
type Pending = (posthog: PostHog) => void;

let enabled = false;
let instance: PostHog | null = null;
const pending: Pending[] = [];
const MAX_PENDING = 20;

function run(fn: Pending) {
  if (!enabled) return;
  if (instance) fn(instance);
  else if (pending.length < MAX_PENDING) pending.push(fn);
}

/** Whether recording is paused because the current route is never recorded. */
let recordingPaused = false;

/** Called by AnalyticsLoader when a project key exists (enable) and once posthog-js is ready (attach). */
export function enableAnalytics() {
  enabled = true;
}
export function attachAnalytics(posthog: PostHog, opts: { recordingPaused: boolean }) {
  instance = posthog;
  recordingPaused = opts.recordingPaused;
  for (const fn of pending.splice(0)) fn(posthog);
}

/**
 * Recording follows the route: paused on a never-recorded route, resumed (subject to the 20% sample)
 * when the visitor leaves it.
 */
export function followRoute(pathname: string) {
  run((posthog) => {
    const blocked = isRecordingBlocked(pathname);
    if (blocked && !recordingPaused) {
      posthog.stopSessionRecording();
      recordingPaused = true;
    } else if (!blocked && recordingPaused) {
      posthog.startSessionRecording();
      recordingPaused = false;
    }
  });
}

export function track<E extends ClientEvent>(event: E, props: ClientEventProps[E]) {
  run((posthog) => posthog.capture(event, props));
}

/**
 * The internal uuid only, plus role and university (PRD 10 "Identity"). Once per browser and account:
 * later changes to role or university reach PostHog from the database (`$set` in the outbox).
 */
export function identify(userId: string, traits: IdentifyTraits) {
  run((posthog) => {
    if (posthog.get_distinct_id() !== userId) posthog.identify(userId, traits);
  });
}

/** PostHog keeps its identity in localStorage under this prefix (persistence: "localStorage"). */
const STORAGE_PREFIX = "ph_";

/** Sign-out: forget the identity, whether or not posthog-js has loaded in this tab. */
export function resetAnalytics() {
  instance?.reset();
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable (private mode); nothing to clear then.
  }
}
