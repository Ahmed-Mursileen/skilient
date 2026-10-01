"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton } from "@/components/teach/action-button";
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { addNote, addToShortlist, createShortlist, deleteNote, inviteToApply, sendContactRequest } from "@/lib/actions/recruit";
import { CONTACT_LIMITS, CONTACT_TEMPLATES } from "@/lib/recruit/constants";

export function ShortlistControl({
  studentId,
  lists,
  inLists,
}: {
  studentId: string;
  lists: { id: string; name: string }[];
  inLists: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pick, setPick] = useState(lists.find((l) => !inLists.some((i) => i.id === l.id))?.id ?? "");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const free = lists.filter((l) => !inLists.some((i) => i.id === l.id));
  return (
    <div className="flex flex-col gap-3" data-testid="shortlist-control">
      <h2 className="text-h4">Shortlist</h2>
      {inLists.length > 0 ? <p className="text-body-sm text-text-secondary">On: {inLists.map((l) => l.name).join(", ")}</p> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      {free.length > 0 ? (
        <div className="flex gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger aria-label="Shortlist" data-testid="shortlist-select">
              <SelectValue placeholder="Choose a list" />
            </SelectTrigger>
            <SelectContent>
              {free.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            loading={pending}
            disabled={!pick}
            data-testid="shortlist-add"
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await addToShortlist(pick, studentId);
                if (r.ok) router.refresh();
                else setError(r.message);
              })
            }
          >
            Add
          </Button>
        </div>
      ) : null}
      <form
        noValidate
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const made = await createShortlist(newName);
            if (!made.ok) return setError(made.message);
            const r = await addToShortlist(made.data, studentId);
            if (r.ok) {
              setNewName("");
              router.refresh();
            } else setError(r.message);
          });
        }}
      >
        <Input aria-label="New list name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New list" maxLength={60} data-testid="new-list-name" />
        <Button type="submit" variant="ghost" loading={pending} data-testid="new-list-create">Create and add</Button>
      </form>
    </div>
  );
}

export function NotesPanel({ studentId, notes }: { studentId: string; notes: { id: string; body: string; created_at: string; created_label: string; author: string | null; mine: boolean }[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await addNote(studentId, body);
      if (r.ok) {
        setBody("");
        router.refresh();
      } else setError(r.message);
    });
  }
  return (
    <section aria-labelledby="notes-h" className="flex flex-col gap-3" data-testid="notes">
      <h2 id="notes-h" className="text-h4">Private notes</h2>
      <p className="text-body-sm text-text-muted">Only your organisation can read these. The student never sees them.</p>
      <ul className="flex flex-col gap-2">
        {notes.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-2 rounded-md border border-border-default bg-bg-subtle p-3">
            <div>
              <p className="text-body whitespace-pre-line">{n.body}</p>
              <p className="text-caption text-text-secondary">{n.author ?? "Former member"} · {n.created_label}</p>
            </div>
            {n.mine ? <ActionButton action={() => deleteNote(n.id, studentId)} variant="ghost" size="sm">Delete</ActionButton> : null}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Textarea aria-label="Add a note" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} placeholder="Add a note for your team" data-testid="note-body" />
        <Button type="submit" variant="secondary" loading={pending} disabled={!body.trim()} className="self-start" data-testid="note-add">Add note</Button>
      </form>
    </section>
  );
}

/** One credit per request, never refunded; the message names the role and is at least 50 characters. */
export function ContactDialog({ studentId, creditsLeft }: { studentId: string; creditsLeft: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="contact-open">Contact request</Button>
      </DialogTrigger>
      <DialogContent title="Ask to talk" description={`This costs one contact credit${creditsLeft === null ? "" : ` (${creditsLeft} left this month)`} and isn't refunded if they decline. They see your company, the role and your message first; you see their name only if they accept.`}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const r = await sendContactRequest({ studentId, role, message });
              if (r.ok) {
                setOpen(false);
                setRole("");
                setMessage("");
                router.refresh();
              } else setError(r.message);
            });
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="flex flex-wrap gap-2" aria-label="Templates">
            {CONTACT_TEMPLATES.map((t) => (
              <Button key={t.key} type="button" variant="ghost" size="sm" onClick={() => setMessage(t.text)}>
                {t.label} template
              </Button>
            ))}
          </div>
          <Field id="contact-role" label="Role or opportunity">
            <Input id="contact-role" value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} placeholder="React intern, summer 2027" data-testid="contact-role" />
          </Field>
          <Field id="contact-message" label="Message" helper={`${message.trim().length} characters. At least ${CONTACT_LIMITS.minMessage}, at most ${CONTACT_LIMITS.maxMessage}.`}>
            <Textarea id="contact-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={CONTACT_LIMITS.maxMessage} data-testid="contact-message" />
          </Field>
          <Button type="submit" loading={pending} data-testid="contact-send">Send request</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InviteToApplyControl({ studentId, jobs }: { studentId: string; jobs: { id: string; title: string }[] }) {
  const router = useRouter();
  const [job, setJob] = useState(jobs[0]?.id ?? "");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (jobs.length === 0) return <p className="text-body-sm text-text-muted">Publish a job to invite candidates to apply.</p>;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-h4">Invite to apply</h2>
      {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
      <div className="flex gap-2">
        <Select value={job} onValueChange={setJob}>
          <SelectTrigger aria-label="Job">
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
          variant="secondary"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setMsg(null);
              const r = await inviteToApply(job, [studentId]);
              if (!r.ok) setMsg({ tone: "error", text: r.message });
              else {
                setMsg({ tone: "success", text: r.data > 0 ? "Invitation sent." : "They already applied or were invited." });
                router.refresh();
              }
            })
          }
        >
          Invite
        </Button>
      </div>
    </div>
  );
}
