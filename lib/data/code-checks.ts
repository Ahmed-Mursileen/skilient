import "server-only";

import type { CodeCheckStatus } from "@/lib/code-checks/constants";
import { ageLabel, dayLabel } from "@/lib/format/time";
import { createClient } from "@/lib/supabase/server";

/**
 * Code-check reads (PRD 5.5). The student reads their own check through my_code_check();
 * graders through code_check_case(). The code itself comes from the code-check Edge Function,
 * which reads it from GitHub each time and checks who is asking (never stored here either).
 */

export interface Snippet {
  path: string;
  startLine: number;
  lines: string[];
}

export type SnippetResult = { ok: true; snippet: Snippet } | { ok: false; reason: "gone" | "unavailable" };

/** Calls the Edge Function with the signed-in user's session; it verifies the token with Auth. */
export async function getSnippet(checkId: string): Promise<SnippetResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke<{ path: string; start_line: number; lines: string[] }>("code-check", {
    body: { check_id: checkId },
  });
  if (error || !data?.lines) {
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    return { ok: false, reason: status === 410 ? "gone" : "unavailable" };
  }
  return { ok: true, snippet: { path: data.path, startLine: data.start_line, lines: data.lines } };
}

export interface MyCodeCheck {
  id: string;
  skillId: string;
  skillName: string;
  status: CodeCheckStatus;
  prompt: string | null;
  path: string | null;
  answers: { what?: string; why?: string; change?: string };
  rubric: Record<string, { pass: boolean; comment?: string }> | null;
  feedback: string | null;
  /** Seconds left in the attempt (with no grace), computed on the server. */
  secondsLeft: number | null;
  snippetServed: boolean;
  requestedLabel: string;
  submittedLabel: string | null;
  unavailableReason: string | null;
}

export async function getMyCodeCheck(id: string): Promise<MyCodeCheck | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_code_check", { p_id: id });
  if (error) throw new Error(`my_code_check: ${error.code}`);
  const c = data?.[0];
  if (!c) return null;
  return {
    id: c.id,
    skillId: c.skill_id,
    skillName: c.skill_name,
    status: c.status,
    prompt: c.prompt,
    path: c.path,
    answers: (c.answers ?? {}) as MyCodeCheck["answers"],
    rubric: (c.rubric ?? null) as MyCodeCheck["rubric"],
    feedback: c.feedback,
    secondsLeft: c.deadline_at ? Math.max(0, Math.floor((Date.parse(c.deadline_at) - Date.now()) / 1000)) : null,
    snippetServed: c.snippet_served,
    requestedLabel: dayLabel(c.requested_at),
    submittedLabel: c.submitted_at ? dayLabel(c.submitted_at) : null,
    unavailableReason: c.unavailable_reason,
  };
}

export interface CodeCheckQueueRow {
  id: string;
  student: string;
  skill: string;
  status: CodeCheckStatus;
  claimedBy: string | null;
  claimedByMe: boolean;
  conflict: boolean;
  age: string;
  overdue: boolean;
  gradedLabel: string | null;
}

export async function getCodeCheckQueue(status: "submitted" | "graded"): Promise<CodeCheckQueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("code_check_queue", { p_status: status });
  if (error) throw new Error(`code_check_queue: ${error.code}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    student: r.student_name,
    skill: r.skill_name,
    status: r.status,
    claimedBy: r.claimed_by_name,
    claimedByMe: r.claimed_by_me ?? false,
    conflict: r.conflict ?? false,
    age: r.submitted_at ? ageLabel(r.submitted_at) : "",
    overdue: r.overdue ?? false,
    gradedLabel: r.graded_at ? dayLabel(r.graded_at) : null,
  }));
}

export interface CodeCheckCase {
  id: string;
  student: string;
  skill: string;
  status: CodeCheckStatus;
  prompt: string | null;
  path: string | null;
  answers: { what?: string; why?: string; change?: string };
  rubric: Record<string, { pass: boolean; comment?: string }> | null;
  feedback: string | null;
  claimedBy: string | null;
  claimedByMe: boolean;
  conflict: boolean;
  age: string;
  overdue: boolean;
}

export async function getCodeCheckCase(id: string): Promise<CodeCheckCase | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("code_check_case", { p_id: id });
  if (error) throw new Error(`code_check_case: ${error.code}`);
  const c = data?.[0];
  if (!c) return null;
  return {
    id: c.id,
    student: c.student_name,
    skill: c.skill_name,
    status: c.status,
    prompt: c.prompt,
    path: c.path,
    answers: (c.answers ?? {}) as CodeCheckCase["answers"],
    rubric: (c.rubric ?? null) as CodeCheckCase["rubric"],
    feedback: c.feedback,
    claimedBy: c.claimed_by_name,
    claimedByMe: c.claimed_by_me ?? false,
    conflict: c.conflict ?? false,
    age: c.submitted_at ? ageLabel(c.submitted_at) : "",
    overdue: c.overdue ?? false,
  };
}
