import "server-only";

const KEY_NAME = "NEXT_PUBLIC_POSTHOG_KEY";

/**
 * The PostHog project key (`phc_…`, public by design), read at run time rather than inlined at build,
 * so one build can run with or without analytics (the E2E analytics server sets it; CI's main server
 * doesn't). Null when unset or malformed: nothing loads then.
 */
export function posthogProjectKey(): string | null {
  // A computed name keeps the bundler from inlining the build-time value.
  const value = process.env[KEY_NAME];
  return value && /^phc_[A-Za-z0-9]+$/.test(value) ? value : null;
}
