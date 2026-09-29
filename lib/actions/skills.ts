"use server";

import { z } from "zod";
import { actionContext } from "@/lib/actions/context";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { dayLabel } from "@/lib/format/time";
import { createClient } from "@/lib/supabase/server";

/**
 * The skill drawer's evidence list (PRD 5.5 "skill drawer"): the owner's own commits
 * behind one skill. Evidence is owner-only (RLS); this reads it for the signed-in user
 * only, never for a user id from the browser.
 */

export interface EvidenceItem {
  sha: string;
  /** Owner-only view, so the real name even for private repositories. */
  repo: string | null;
  url: string | null;
  occurredAt: string;
  /** Formatted on the server (Node and browser ICU differ). */
  dateLabel: string;
  detectors: string[];
  paths: string[];
  lines: number;
  status: "counted" | "held" | "excluded" | "pending";
  exclusion: string | null;
  signed: boolean;
}

/** What L3 and L4 rest on (PRD 5.5): merged pull requests, confirmed entries, endorsements. */
export interface ProofItem {
  kind: "pull_request" | "contribution" | "endorsement";
  level: 3 | 4;
  title: string;
  detail: string | null;
  /** GitHub link for a pull request. */
  url: string | null;
  /** The venture, for a confirmed entry or an endorsement. */
  ventureId: string | null;
  dateLabel: string;
}

export interface SkillEvidence {
  items: EvidenceItem[];
  total: number;
  proofs: ProofItem[];
}

const input = z.object({ skillId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/) });
const LIMIT = 25;

export async function loadSkillEvidence(skillId: string): Promise<ActionResult<SkillEvidence>> {
  const ctx = await actionContext("skills.evidence");
  const parsed = input.safeParse({ skillId });
  if (!parsed.success) {
    ctx.done("refused", { error_code: "invalid_input" });
    return fail("invalid_input", "That skill isn't recognised. Refresh the page.");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    ctx.done("refused", { error_code: "no_session" });
    return fail("no_session", "Your session expired. Sign in again to see your evidence.");
  }

  // Ownership: only the signed-in student's own rows (RLS and my_skill_proofs enforce the same).
  const [{ data: rows, count, error }, proofs] = await Promise.all([
    supabase
      .from("skill_evidence")
      .select("repo_id, sha, detectors, paths, lines, occurred_at", { count: "exact" })
      .eq("user_id", user.id)
      .eq("skill_id", parsed.data.skillId)
      .order("occurred_at", { ascending: false })
      .limit(LIMIT),
    supabase.rpc("my_skill_proofs", { p_skill: parsed.data.skillId }),
  ]);
  if (error || proofs.error) {
    ctx.done("error", { error_code: (error ?? proofs.error)?.code, user_id: user.id });
    return fail("unavailable", "Couldn't load your evidence. Try again.", { requestId: ctx.requestId });
  }
  const evidence = rows ?? [];
  const shas = [...new Set(evidence.map((e) => e.sha))];
  const repoIds = [...new Set(evidence.map((e) => e.repo_id))];
  const [commits, repos] = await Promise.all([
    shas.length
      ? supabase.from("github_commits").select("repo_id, sha, status, exclusion, signed").eq("user_id", user.id).in("sha", shas)
      : Promise.resolve({ data: [], error: null }),
    repoIds.length
      ? supabase.from("github_repos").select("repo_id, full_name").in("repo_id", repoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (commits.error || repos.error) {
    ctx.done("error", { error_code: (commits.error ?? repos.error)?.code, user_id: user.id });
    return fail("unavailable", "Couldn't load your evidence. Try again.", { requestId: ctx.requestId });
  }
  const commitBy = new Map((commits.data ?? []).map((c) => [`${c.repo_id}:${c.sha}`, c]));
  const repoBy = new Map((repos.data ?? []).map((r) => [r.repo_id, r.full_name]));

  const items: EvidenceItem[] = evidence.map((e) => {
    const commit = commitBy.get(`${e.repo_id}:${e.sha}`);
    const repo = repoBy.get(e.repo_id) ?? null;
    return {
      sha: e.sha,
      repo,
      url: repo ? `https://github.com/${repo}/commit/${e.sha}` : null,
      occurredAt: e.occurred_at,
      dateLabel: dayLabel(e.occurred_at),
      detectors: e.detectors,
      paths: e.paths,
      lines: e.lines,
      status: commit?.status ?? "pending",
      exclusion: commit?.exclusion ?? null,
      signed: commit?.signed ?? false,
    };
  });
  const proofItems: ProofItem[] = (proofs.data ?? []).map((p) => ({
    kind: p.kind as ProofItem["kind"],
    level: p.level === 4 ? 4 : 3,
    title: p.title,
    detail: p.detail,
    url: p.url,
    ventureId: p.venture_id,
    dateLabel: dayLabel(p.occurred_at),
  }));
  ctx.done("ok", { user_id: user.id, items: items.length, proofs: proofItems.length });
  return ok({ items, total: count ?? items.length, proofs: proofItems });
}
