"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, FieldError, Input, Textarea } from "@/components/ui";
import { controlBase } from "@/components/ui/field";
import { approveTeacher, importFacultyCsv, revokeTeacher, reviewTeacherFlag } from "@/lib/actions/ops/teachers";
import { cn } from "@/lib/cn";

/** Approve a pending teacher request (accounts staff, PRD 5.21). */
export function ApproveTeacherButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        loading={pending}
        data-testid="approve-teacher"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await approveTeacher(userId);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        Approve
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

/** Remove a teacher's role with a reason; their past work stays as "former faculty". */
export function RevokeTeacherForm({ userId }: { userId: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        Remove role
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const result = await revokeTeacher(userId, reason);
          if (result.ok) router.refresh();
          else setError(result.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <label htmlFor={id} className="text-body-sm font-semibold">Reason</label>
      <Input id={id} value={reason} onChange={(e) => setReason(e.currentTarget.value)} required maxLength={2000} />
      <div className="flex gap-2">
        <Button size="sm" type="submit" variant="danger" loading={pending}>Remove</Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

/** Pre-approve faculty emails for a university: one email per line, optionally "email,department,title". */
export function FacultyCsvForm({ universities }: { universities: { id: string; name: string }[] }) {
  const router = useRouter();
  const id = useId();
  const [university, setUniversity] = useState("");
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setMessage(null);
          const result = await importFacultyCsv(university, csv);
          if (result.ok) {
            setMessage({ tone: "success", text: `${result.data.count} email${result.data.count === 1 ? "" : "s"} added. Matching requests are approved.` });
            setCsv("");
            router.refresh();
          } else setMessage({ tone: "error", text: result.message });
        });
      }}
    >
      <h2 className="text-h4">Faculty list</h2>
      <p className="text-body-sm text-text-secondary">Emails on the list are approved as teachers the moment they ask for the role. One per line; department and title are optional.</p>
      {message ? <FormAlert tone={message.tone}>{message.text}</FormAlert> : null}
      <label htmlFor={`${id}-u`} className="text-body-sm font-semibold">University</label>
      <select id={`${id}-u`} value={university} onChange={(e) => setUniversity(e.target.value)} required className={cn(controlBase, "h-10")}>
        <option value="">Choose a university</option>
        {universities.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <label htmlFor={`${id}-c`} className="text-body-sm font-semibold">Emails</label>
      <Textarea id={`${id}-c`} rows={6} value={csv} onChange={(e) => setCsv(e.currentTarget.value)} required placeholder={"name@university.edu.pk,Computer Science,Lecturer"} />
      <Button type="submit" loading={pending} className="self-start">Import</Button>
    </form>
  );
}

/** A trust reviewer's decision on an endorsement-concentration flag. */
export function TeacherFlagForm({ id }: { id: string }) {
  const router = useRouter();
  const uid = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = (upheld: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await reviewTeacherFlag(id, upheld, reason);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  return (
    <div className="flex flex-col gap-2">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <label htmlFor={uid} className="text-body-sm font-semibold">Reason</label>
      <Input id={uid} value={reason} onChange={(e) => setReason(e.currentTarget.value)} maxLength={2000} />
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" loading={pending} onClick={() => decide(false)}>Clear</Button>
        <Button size="sm" variant="danger" loading={pending} onClick={() => decide(true)}>Uphold</Button>
      </div>
    </div>
  );
}
