import type * as SentryModule from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentry-scrub";

/**
 * Sentry in the browser. The SDK is its own chunk: the app loads it straight away; the public
 * marketing pages load it only when something goes wrong, then report that error. This keeps them
 * inside the PRD 10 performance budget (decisions 2026-10-02). Router transitions on marketing
 * pages aren't traced.
 */
let sentry: Promise<typeof SentryModule> | null = null;
let loaded: typeof SentryModule | null = null;

function load(): Promise<typeof SentryModule> {
  sentry ??= import("@sentry/nextjs").then((S) => {
    S.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ...sentryBaseOptions });
    loaded = S;
    return S;
  });
  return sentry;
}

const MARKETING = /^\/(?:$|(?:recruiters|universities|faculty|about|pricing|request-university|terms|privacy)(?:\/|$))/;

if (MARKETING.test(window.location.pathname)) {
  const report = (error: unknown) => void load().then((S) => S.captureException(error));
  window.addEventListener("error", (e) => report(e.error ?? e.message), { once: true });
  window.addEventListener("unhandledrejection", (e) => report(e.reason), { once: true });
} else {
  void load();
}

export const onRouterTransitionStart: typeof SentryModule.captureRouterTransitionStart = (...args) =>
  loaded?.captureRouterTransitionStart(...args);
