"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, type ActionResult } from "@/lib/actions/result";
import { call, NO_SESSION, signedIn } from "@/lib/actions/rpc";

/**
 * Teacher verification in /ops (PRD 5.21, 5.26): accounts staff approve or remove teachers and
 * import faculty CSVs; trust reviewers decide endorsement-concentration flags. Each SQL function
 * re-checks the role and the two-factor session and writes its ops_audit_log row.
 */

const uuid = z.uuid();
const reason = z.string().trim().min(3, "Give a reason.").max(2000, "Keep the reason under 2,000 characters.");

export async function approveTeacher(userId: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.teacher_approve");
  if (!uuid.safeParse(userId).success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That request doesn't exist.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "approve_teacher", { p_user: userId }, ["/ops/teachers"]);
}

export async function revokeTeacher(userId: string, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.teacher_revoke");
  const parsed = z.object({ id: uuid, why: reason }).safeParse({ id: userId, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Give a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "revoke_teacher", { p_user: userId, p_reason: parsed.data.why }, ["/ops/teachers"]);
}

/** One email per line, optionally "email,department,title". */
function parseCsv(text: string): { email: string; department?: string; title?: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^email\b/i.test(line))
    .map((line) => {
      const [email, department, title] = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return { email: email.toLowerCase(), ...(department ? { department } : {}), ...(title ? { title } : {}) };
    });
}

export async function importFacultyCsv(universityId: string, csv: string): Promise<ActionResult<{ count: number }>> {
  const ctx = await actionContext("ops.faculty_csv");
  const rows = parseCsv(csv.slice(0, 400_000));
  const parsed = z
    .object({
      id: uuid,
      rows: z
        .array(z.object({ email: z.string().max(254).regex(/^[^@\s]+@[^@\s]+$/, "Not an email address."), department: z.string().max(80).optional(), title: z.string().max(80).optional() }))
        .min(1, "Add at least one email.")
        .max(2000, "Import up to 2,000 rows at a time."),
    })
    .safeParse({ id: universityId, rows });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Check the list.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  const result = await call<number>(ctx, session.supabase, session.userId, "import_faculty_csv", { p_university: universityId, p_rows: parsed.data.rows }, [
    "/ops/teachers",
  ]);
  return result.ok ? { ok: true, data: { count: result.data } } : result;
}

export async function reviewTeacherFlag(id: string, upheld: boolean, why: string): Promise<ActionResult> {
  const ctx = await actionContext("ops.teacher_flag");
  const parsed = z.object({ id: uuid, upheld: z.boolean(), why: reason }).safeParse({ id, upheld, why });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Choose a decision and give a reason.");
  }
  const session = await signedIn(ctx);
  if (!session) return NO_SESSION;
  return call(ctx, session.supabase, session.userId, "review_teacher_flag", { p_id: id, p_upheld: upheld, p_reason: parsed.data.why }, ["/ops/teachers"]);
}
