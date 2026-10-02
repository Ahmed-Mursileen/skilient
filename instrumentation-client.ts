import type * as SentryModule from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentry-scrub";

/**
 * Sentry in the browser. The SDK is its own chunk: the app loads it straight away; the public
 * marketing pages load it once the page is idle, which keeps them inside the PRD 10 JavaScript
 * budget (decisions 2026-10-02). Router transitions before it loads aren't traced.
 */
let sentry: typeof SentryModule | null = null;

function load() {
  void import("@sentry/nextjs").then((S) => {
    S.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ...sentryBaseOptions });
    sentry = S;
  });
}

const MARKETING = /^\/(?:$|(?:recruiters|universities|faculty|about|pricing|request-university|terms|privacy)(?:\/|$))/;

if (MARKETING.test(window.location.pathname)) {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
  window.addEventListener("load", () => idle(load, { timeout: 4000 }), { once: true });
} else {
  load();
}

export const onRouterTransitionStart: typeof SentryModule.captureRouterTransitionStart = (...args) =>
  sentry?.captureRouterTransitionStart(...args);
