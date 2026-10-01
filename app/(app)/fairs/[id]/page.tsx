import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/teach/action-button";
import { FairLive } from "@/components/uni/fair-live";
import { Card, PageTitle, Section } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { Badge } from "@/components/ui";
import { addSlots, answerCall, bookSlot, callNext, joinQueue, leaveBooth, markFair, saveBooth } from "@/lib/actions/uni";
import { isRefusal } from "@/lib/data/rpc-json";
import { getBoothQueue, getFairView, type BoothQueue, type FairStudent, type FairView } from "@/lib/data/uni";
import { clockTime, eventTime } from "@/lib/format/time";
import { TIER_LABELS } from "@/lib/recruit/constants";

export const metadata: Metadata = { title: "Job fair" };

const STATUS = { upcoming: "Starts soon", live: "Live now", ended: "Ended", cancelled: "Cancelled" } as const;

/**
 * /fairs/[id] (PRD 5.23): the booth grid and your queues for students; the company's own queue,
 * interview slots and "Call next" for recruiters (verified organisations only).
 */
export default async function FairPage({ params }: PageProps<"/fairs/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let f: FairView;
  try {
    f = await getFairView(id);
  } catch (err) {
    if (isRefusal(err, "P0002", "42501")) notFound();
    throw err;
  }
  let booth: BoothQueue | null = null;
  if (f.viewer === "recruiter" && f.my_booth) {
    try {
      booth = await getBoothQueue(f.my_booth);
    } catch (err) {
      if (!isRefusal(err, "55000", "P0002", "42501")) throw err;
    }
  }
  return (
    <main className="mx-auto flex w-full max-w-page flex-col gap-6 px-[var(--page-gutter)] py-6">
      <FairLive channel={id} />
      <PageTitle title={f.title}>{f.university} · {eventTime(f.starts_at)} to {eventTime(f.ends_at)} · {STATUS[f.status]}</PageTitle>
      {f.viewer === "student" ? (
        <p className="text-body-sm text-text-secondary">When you join a company&apos;s queue, that company sees your name, department, batch, tier and verified skills during the fair and for 14 days after. Leave its queue and it stops seeing you at once (interviews already held stay). You can wait in up to 3 queues.</p>
      ) : null}
      {booth && f.my_booth ? <RecruiterBooth boothId={f.my_booth} data={booth} live={f.status === "live"} /> : null}
      {f.viewer === "recruiter" && !booth ? <Card><p className="text-body">Your booth opens once Skilient has verified your organisation.</p></Card> : null}
      <Section title="Companies" id="c-h">
        {f.booths.length === 0 ? <p className="text-body text-text-secondary">No companies yet.</p> : null}
        <ul className="grid gap-3 md:grid-cols-2" data-testid="booths">
          {f.booths.map((b) => (
            <li key={b.id}>
              <Card className="flex flex-col gap-2">
                <h3 className="text-h3"><Link className="underline-offset-4 hover:underline" href={`/companies/${b.company_slug}` as Route}>{b.company}</Link></h3>
                {b.roles.length ? <p className="text-body-sm">Hiring: {b.roles.join(", ")}</p> : null}
                {b.about ? <p className="text-body-sm text-text-secondary">{b.about}</p> : null}
                <p className="text-body-sm text-text-secondary">{b.waiting} waiting · {b.open_slots} interview slots open</p>
                {f.viewer === "student" ? (
                  <div className="flex flex-col gap-2">
                    {b.my_queue ? (
                      <div className="flex flex-wrap items-center gap-2" data-testid="my-queue">
                        {b.my_queue.status === "waiting" ? <Badge tone="info">{b.my_queue.ahead === 0 ? "You're next" : `${b.my_queue.ahead} ahead of you`}</Badge> : null}
                        {b.my_queue.status === "called" ? (
                          <ActionButton variant="primary" size="sm" action={answerCall.bind(null, b.my_queue.id)}>They&apos;re calling you: I&apos;m here</ActionButton>
                        ) : null}
                        {b.my_queue.status === "talking" && b.my_queue.thread_id ? <Link className="underline" href={`/chat/${b.my_queue.thread_id}` as Route}>Open the chat</Link> : null}
                        <ActionButton size="sm" variant="ghost" action={leaveBooth.bind(null, b.id)}>Leave this company</ActionButton>
                      </div>
                    ) : f.status === "live" ? (
                      <ActionButton size="sm" variant="primary" testId="join-queue" action={joinQueue.bind(null, b.id)}>Join the queue</ActionButton>
                    ) : null}
                    {b.my_slot ? <p className="text-body-sm">Your interview: {eventTime(b.my_slot.starts_at)}</p> : (b.slots ?? []).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-body-sm font-semibold">Book an interview slot</summary>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {(b.slots ?? []).slice(0, 20).map((s) => <li key={s.id}><ActionButton size="sm" action={bookSlot.bind(null, s.id)}>{clockTime(s.starts_at)}</ActionButton></li>)}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

function StudentLine({ s }: { s: FairStudent }) {
  return (
    <span className="flex flex-col">
      <span className="font-semibold">{s.name}</span>
      <span className="text-body-sm text-text-secondary">
        {[s.department, s.batch ? `class of ${s.batch}` : null, s.tier ? TIER_LABELS[s.tier as keyof typeof TIER_LABELS] : null].filter(Boolean).join(" · ")}
      </span>
      <span className="text-body-sm">{s.skills.map((k) => `${k.name} L${k.level}`).join(", ")}</span>
    </span>
  );
}

function RecruiterBooth({ boothId, data, live }: { boothId: string; data: BoothQueue; live: boolean }) {
  const waiting = data.queue.filter((q) => q.status === "waiting");
  const active = data.queue.filter((q) => q.status === "called" || q.status === "talking");
  return (
    <Section title="Your booth" id="booth-h">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body">{waiting.length} waiting</span>
        {live && waiting.length > 0 ? <ActionButton variant="primary" testId="call-next" action={callNext.bind(null, boothId)}>Call next</ActionButton> : null}
      </div>
      <ul className="flex flex-col gap-2" data-testid="booth-queue">
        {active.map((q) => (
          <li key={q.id}><Card className="flex flex-wrap items-center justify-between gap-2">
            <StudentLine s={q.student} />
            <span className="flex items-center gap-2">
              <Badge>{q.status === "called" ? "Called" : "Talking"}</Badge>
              {q.thread_id ? <Link className="underline" href={`/chat/${q.thread_id}` as Route}>Chat</Link> : null}
              <ActionButton size="sm" action={markFair.bind(null, { kind: "done", id: q.id })}>Done</ActionButton>
            </span>
          </Card></li>
        ))}
        {waiting.map((q) => <li key={q.id}><Card className="flex items-center gap-3"><span className="text-body-sm text-text-secondary">#{q.position}</span><StudentLine s={q.student} /></Card></li>)}
      </ul>
      <Section title="Interview slots" id="slots-h">
        <ul className="flex flex-col gap-2">
          {data.slots.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 text-body">
              <span>{clockTime(s.starts_at)}–{clockTime(s.ends_at)}</span>
              {s.student ? <StudentLine s={s.student} /> : <span className="text-text-secondary">Open</span>}
              {s.student && !s.held ? <ActionButton size="sm" action={markFair.bind(null, { kind: "held", id: s.id })}>Interview held</ActionButton> : null}
              {s.held ? <Badge tone="success">Held</Badge> : null}
            </li>
          ))}
        </ul>
        <RpcForm action={addSlots as FormAction} extra={{ boothId }} after="reset" submitLabel="Add slots" fields={[
          { name: "startsAt", label: "First slot starts", type: "datetime-local", required: true },
          { name: "count", label: "How many", type: "number", defaultValue: 8 },
          { name: "minutes", label: "Minutes each (15 to 60)", type: "number", defaultValue: 20 },
        ]} />
      </Section>
      <RpcForm action={saveBooth as FormAction} extra={{ boothId }} submitLabel="Save booth" successText="Saved." fields={[
        { name: "roles", label: "Roles you're hiring for, comma separated", type: "text", defaultValue: data.booth.roles.join(", ") },
        { name: "about", label: "About your company", type: "textarea", rows: 2, defaultValue: data.booth.about ?? "" },
      ]} />
    </Section>
  );
}
