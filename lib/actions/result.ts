/**
 * Typed results for server actions (CLAUDE.md: typed error on every action). Safe to
 * import from client components: no server code here.
 */
export interface ActionError {
  ok: false;
  /** Stable machine code, e.g. "invalid_credentials", "rate_limited". */
  code: string;
  /** User-facing message that names the fix. */
  message: string;
  /** Field → message for inline validation. */
  fields?: Record<string, string>;
  /** Logged request id, shown as "Ref" so a report maps to a log line. */
  requestId?: string;
  /** Extra hints for the form, e.g. { captcha: true }. */
  hints?: Record<string, boolean | string>;
}

export type ActionResult<T = null> = { ok: true; data: T } | ActionError;

export function fail(code: string, message: string, extra: Partial<Omit<ActionError, "ok" | "code" | "message">> = {}): ActionError {
  return { ok: false, code, message, ...extra };
}

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

/** First Zod issue per field, for inline errors. */
export function fieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
