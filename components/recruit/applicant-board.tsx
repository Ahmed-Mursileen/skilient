"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TierBadge } from "@/components/ui";
import { bulkMoveApplications, moveApplication } from "@/lib/actions/recruit";
import type { Applicant } from "@/lib/data/recruit";
import { REJECT_REASONS, STAGE_LABELS, STAGES } from "@/lib/recruit/constants";

type Forward = "screening" | "interview" | "offer" | "hired";
const NEXT: Record<string, Forward | null> = { applied: "screening", screening: "interview", interview: "offer", offer: "hired" };

/**
 * The pipeline (PRD 5.20): applied, screening, interview, offer, hired or rejected as columns, with a
 * move button per card and bulk actions. Every move tells the student the stage; a rejection needs a
 * reason and the student sees a generic one, never these notes.
 */
export function ApplicantBoard({ jobId, applicants }: { jobId: string; applicants: Applicant[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState<string>("skills_gap");
  const [bulk, setBulk] = useState<string>("screening");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setPicked([]);
        router.refresh();
      } else setMsg(r.message ?? "That didn't work.");
    });
  }

  const columns = STAGES.map((stage) => ({ stage, items: applicants.filter((a) => a.stage === stage) }));
  return (
    <div className="flex flex-col gap-4">
      {msg ? <FormAlert>{msg}</FormAlert> : null}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-bg-subtle p-3" data-testid="bulk-bar">
        <span className="text-body-sm font-semibold">{picked.length} selected:</span>
        <Select value={bulk} onValueChange={setBulk}>
          <SelectTrigger aria-label="Move to" className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {bulk === "rejected" ? (
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger aria-label="Reason" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REJECT_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button size="sm" disabled={picked.length === 0} loading={pending} onClick={() => run(() => bulkMoveApplications(jobId, picked, bulk as (typeof STAGES)[number], bulk === "rejected" ? reason : null))}>
          Move
        </Button>
      </div>
      <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6" data-testid="board">
        {columns.map((c) => (
          <section key={c.stage} aria-labelledby={`col-${c.stage}`} className="flex min-w-[14rem] flex-col gap-2 rounded-lg border border-border-default bg-bg-subtle p-2">
            <h2 id={`col-${c.stage}`} className="px-1 text-h4">{STAGE_LABELS[c.stage]} <span className="text-body-sm text-text-secondary">({c.items.length})</span></h2>
            <ul className="flex flex-col gap-2">
              {c.items.map((a) => (
                <li key={a.id} className="flex flex-col gap-1.5 rounded-md border border-border-default bg-bg-surface p-2" data-testid="applicant" data-stage={a.stage}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1 size-4" aria-label={`Select ${a.name}`} checked={picked.includes(a.id)} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((x) => x !== a.id)))} />
                    <div className="min-w-0">
                      <Link href={`/recruit/candidates/${a.student_id}` as Route} className="font-semibold underline-offset-4 hover:underline">{a.name}</Link>
                      <p className="text-caption text-text-secondary">{[a.department, a.university].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  {a.tier ? <TierBadge tier={a.tier} /> : null}
                  <p className="text-caption">{a.skills.map((s) => `${s.name} L${s.level}`).join(", ")}</p>
                  {a.note ? <p className="text-body-sm italic">“{a.note}”</p> : null}
                  {a.cv_code ? <Link href={`/verify/${a.cv_code}` as Route} className="text-caption font-semibold underline underline-offset-4">Signed CV</Link> : null}
                  {a.stage !== "hired" && a.stage !== "rejected" ? (
                    <div className="flex flex-wrap gap-1">
                      {NEXT[a.stage] ? (
                        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => moveApplication(jobId, a.id, NEXT[a.stage]!))}>
                          {STAGE_LABELS[NEXT[a.stage]!]}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => moveApplication(jobId, a.id, "rejected", "skills_gap"))} aria-label={`Reject ${a.name}: skills gap`}>
                        Reject
                      </Button>
                    </div>
                  ) : a.reject_reason ? (
                    <p className="text-caption text-text-secondary">{REJECT_REASONS.find((r) => r.value === a.reject_reason)?.label}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
