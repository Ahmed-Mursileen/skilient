"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Badge, Button, Textarea } from "@/components/ui";
import { decideApplication, sendApplicationMessage, withdrawApplication } from "@/lib/actions/ventures";
import type { ActionError, ActionResult } from "@/lib/actions/result";
import type { ApplicationItem } from "@/lib/data/ventures";

const STATUS: Record<ApplicationItem["status"], { label: string; tone: "info" | "success" | "neutral" }> = {
  pending: { label: "Waiting", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
};

const when = (iso: string) => new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short" });

/** One application: who, which venture and role, the message and answers, and a short thread. */
export function ApplicationCard({ item, side }: { item: ApplicationItem; side: "received" | "sent" }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const status = STATUS[item.status];
  const open = item.status === "pending";

  const run = (action: () => Promise<ActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) {
        onOk?.();
        router.refresh();
      } else {
        setError(result);
      }
    });

  function onMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get("body") ?? "");
    run(() => sendApplicationMessage(item.id, body), () => form.current?.reset());
  }

  const person = item.person.username ? (
    <Link href={`/profile/${item.person.username}` as Route} className="font-semibold underline-offset-4 hover:underline">
      {item.person.name}
    </Link>
  ) : (
    <span className="font-semibold">{item.person.name}</span>
  );
  const venture = item.venture ? (
    <Link href={`/ventures/${item.venture.id}` as Route} className="font-semibold underline-offset-4 hover:underline">
      {item.venture.title}
    </Link>
  ) : (
    <span className="font-semibold">a venture</span>
  );

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-5" aria-label={`Application from ${side === "received" ? item.person.name : "you"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-body">
          {side === "received" ? (
            <>
              {person} applied to {venture}
            </>
          ) : (
            <>You applied to {venture}</>
          )}
          {item.role ? <span className="text-text-secondary"> as {item.role}</span> : null}
          <span className="text-body-sm text-text-secondary"> · {when(item.createdAt)}</span>
        </p>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <p className="text-body whitespace-pre-line break-words">{item.message}</p>
      {item.answers.length ? (
        <dl className="flex flex-col gap-3">
          {item.answers.map((a) => (
            <div key={a.position}>
              <dt className="text-body-sm font-semibold text-text-secondary">{a.question}</dt>
              <dd className="text-body whitespace-pre-line break-words">{a.answer}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {item.messages.length ? (
        <ol className="flex flex-col gap-2 border-t border-border-default pt-4" aria-label="Messages">
          {item.messages.map((m) => (
            <li key={m.id} className="text-body-sm">
              <span className="font-semibold">{m.mine ? "You" : side === "received" ? item.person.name : "Owner"}</span>
              <span className="text-text-secondary"> · {when(m.createdAt)}</span>
              <p className="text-body whitespace-pre-line break-words">{m.body}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {error ? <FormAlert requestId={error.fields ? undefined : error.requestId}>{error.fields?.body ?? error.message}</FormAlert> : null}

      {open ? (
        <>
          <form ref={form} onSubmit={onMessage} noValidate className="flex flex-col gap-2">
            <label htmlFor={`reply-${item.id}`} className="text-body-sm font-semibold">
              Message
            </label>
            <Textarea id={`reply-${item.id}`} name="body" rows={2} maxLength={1000} required />
            <Button type="submit" variant="secondary" size="sm" disabled={pending} className="self-start">
              Send message
            </Button>
          </form>
          <div className="flex flex-wrap gap-3">
            {side === "received" ? (
              <>
                <Button loading={pending} onClick={() => run(() => decideApplication(item.id, true))}>
                  Accept
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => run(() => decideApplication(item.id, false))}>
                  Decline
                </Button>
              </>
            ) : (
              <Button variant="ghost" loading={pending} onClick={() => run(() => withdrawApplication(item.id))}>
                Withdraw application
              </Button>
            )}
          </div>
        </>
      ) : null}
    </article>
  );
}
