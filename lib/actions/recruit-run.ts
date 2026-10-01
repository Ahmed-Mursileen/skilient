import "server-only";

import type { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, fieldErrors, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * The shape of every recruiter-portal action (CLAUDE.md "How to work" 3): Zod input, the session
 * from getUser(), one SQL function that re-checks the organisation, role, ownership and every limit,
 * a typed result, and one JSON log line with the request id. The user id never comes from the browser.
 */
export async function rpcAction<S extends z.ZodType, T = null>(opts: {
  name: string;
  schema: S;
  input: unknown;
  fn: string;
  args: (v: z.output<S>) => Record<string, unknown>;
  revalidate?: string[];
  invalidMessage?: string;
  /** The input wraps the form values under this key (`{ id, v }`): inline errors name the form's own fields. */
  unwrap?: string;
}): Promise<ActionResult<T>> {
  const ctx = await actionContext(opts.name);
  const parsed = opts.schema.safeParse(opts.input);
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    const issues = parsed.error.issues.map((i) => (opts.unwrap && i.path[0] === opts.unwrap ? { ...i, path: i.path.slice(1) } : i));
    return fail("invalid_input", opts.invalidMessage ?? issues[0]?.message ?? "Check the highlighted fields.", { fields: fieldErrors(issues) });
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call<T>(ctx, session.supabase, session.userId, opts.fn, opts.args(parsed.data), opts.revalidate ?? []);
}
