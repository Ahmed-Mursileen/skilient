import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/** Strip the query string (may carry tokens, emails, search terms). */
export function stripQuery(url: string | undefined): string | undefined {
  if (!url) return url;
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * PRD 10: Sentry never receives names, emails, message/post bodies or query strings.
 * Only the internal user uuid survives.
 */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    event.request.url = stripQuery(event.request.url);
    delete event.request.query_string;
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      const { "user-agent": ua, "x-request-id": rid } = event.request.headers;
      event.request.headers = { ...(ua ? { "user-agent": ua } : {}), ...(rid ? { "x-request-id": rid } : {}) };
    }
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  if (event.message) event.message = event.message.replace(EMAIL, "[email]");
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = ex.value.replace(EMAIL, "[email]");
  }
  return event;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  // Console output and UI text can contain user content.
  if (crumb.category === "console" || crumb.category?.startsWith("ui.")) return null;
  if (crumb.data && typeof crumb.data.url === "string") crumb.data.url = stripQuery(crumb.data.url);
  if (crumb.data && typeof crumb.data.to === "string") crumb.data.to = stripQuery(crumb.data.to);
  if (crumb.data && typeof crumb.data.from === "string") crumb.data.from = stripQuery(crumb.data.from);
  if (crumb.message) crumb.message = crumb.message.replace(EMAIL, "[email]");
  return crumb;
}

export const sentryBaseOptions = {
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
};
