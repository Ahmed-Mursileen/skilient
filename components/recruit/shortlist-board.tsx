"use client";

import { showUpgrade } from "@/components/billing/upgrade-sheet";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton } from "@/components/teach/action-button";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TierBadge } from "@/components/ui";
import { createShortlist, deleteShortlist, inviteToApply, removeFromShortlist, renameShortlist, reorderShortlist } from "@/lib/actions/recruit";
import type { ShortlistItem } from "@/lib/data/recruit";

export function NewShortlistForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await createShortlist(name);
          if (r.ok) {
            setName("");
            router.push(`/recruit/shortlists/${r.data}` as Route);
          } else setError(r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex gap-2">
        <Input aria-label="New list name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name a new list" data-testid="shortlist-name" />
        <Button type="submit" loading={pending} data-testid="shortlist-create">Create list</Button>
      </div>
    </form>
  );
}

/**
 * One shortlist (PRD 5.20): reorder with the move buttons (keyboard-operable), remove, invite people to a
 * job in bulk. Entries whose student turned recruiter visibility off show "no longer visible" with no name
 * or link; their notes are kept and come back if they return.
 */
export function ShortlistBoard({ listId, name, items, jobs }: { listId: string; name: string; items: ShortlistItem[]; jobs: { id: string; title: string }[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(items);
  const [picked, setPicked] = useState<string[]>([]);
  const [job, setJob] = useState(jobs[0]?.id ?? "");
  const [title, setTitle] = useState(name);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function move(index: number, delta: number) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
    startTransition(async () => {
      const r = await reorderShortlist(listId, next.map((i) => i.id));
      if (!r.ok && !showUpgrade(r)) setMsg({ tone: "error", text: r.message });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
      <form
        noValidate
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await renameShortlist(listId, title);
            if (r.ok) router.refresh();
            else setMsg({ tone: "error", text: r.message });
          });
        }}
      >
        <Input aria-label="List name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className="max-w-xs" />
        <Button type="submit" variant="secondary" size="sm" loading={pending}>Rename</Button>
        <ActionButton action={() => deleteShortlist(listId).then((r) => { if (r.ok) router.push("/recruit/shortlists" as Route); return r; })} variant="danger" size="sm">Delete list</ActionButton>
      </form>

      {jobs.length > 0 && order.some((i) => i.visible) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-bg-subtle p-3">
          <span className="text-body-sm font-semibold">Invite {picked.length} selected to apply:</span>
          <Select value={job} onValueChange={setJob}>
            <SelectTrigger aria-label="Job" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>
                  {j.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={picked.length === 0 || !job}
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await inviteToApply(job, picked);
                if (r.ok) {
                  setMsg({ tone: "success", text: `${r.data} invitation${r.data === 1 ? "" : "s"} sent.` });
                  setPicked([]);
                  router.refresh();
                } else setMsg({ tone: "error", text: r.message });
              })
            }
          >
            Send invitations
          </Button>
        </div>
      ) : null}

      <ol className="flex flex-col gap-2" data-testid="shortlist-items">
        {order.map((item, i) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border-default bg-bg-surface p-3" data-testid="shortlist-item">
            {item.visible && item.student_id ? (
              <input
                type="checkbox"
                className="size-4"
                aria-label={`Select ${item.name}`}
                checked={picked.includes(item.student_id)}
                onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, item.student_id!] : cur.filter((x) => x !== item.student_id)))}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              {item.visible && item.student_id ? (
                <>
                  <Link href={`/recruit/candidates/${item.student_id}` as Route} className="text-h4 underline-offset-4 hover:underline">{item.name}</Link>
                  <p className="text-body-sm text-text-secondary">
                    {[item.department, item.university].filter(Boolean).join(" · ")}{item.notes ? ` · ${item.notes} note${item.notes === 1 ? "" : "s"}` : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-h4 text-text-secondary">No longer visible</p>
                  <p className="text-body-sm text-text-muted">This student turned recruiter visibility off. Your notes are kept and come back if they return.</p>
                </>
              )}
              <p className="text-caption text-text-secondary">Added by {item.added_by ?? "a former member"}</p>
            </div>
            {item.visible && item.tier ? <TierBadge tier={item.tier} /> : null}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" aria-label={`Move ${item.name ?? "entry"} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
              <Button variant="ghost" size="sm" aria-label={`Move ${item.name ?? "entry"} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</Button>
              <ActionButton action={() => removeFromShortlist(item.id)} variant="ghost" size="sm">Remove</ActionButton>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
