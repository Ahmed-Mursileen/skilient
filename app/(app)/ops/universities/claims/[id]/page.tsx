import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/uni/page-parts";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { decideClaim } from "@/lib/actions/uni";
import { isRefusal } from "@/lib/data/rpc-json";
import { getOpsClaim } from "@/lib/data/uni";
import { dayLabel } from "@/lib/format/time";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "University claim" };

/** /ops/universities/claims/[id]: the letter (signed URL, 60 s) and the decision (accounts staff, audited). */
export default async function ClaimCasePage({ params }: PageProps<"/ops/universities/claims/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let c;
  try {
    c = await getOpsClaim(id);
  } catch (err) {
    if (isRefusal(err, "P0002", "42501")) notFound();
    throw err;
  }
  const supabase = await createClient();
  const letter = c.letter_path ? (await supabase.storage.from("university-claims").createSignedUrl(c.letter_path, 60)).data?.signedUrl : null;
  return (
    <main className="flex flex-col gap-6">
      <PageTitle title={`Claim: ${c.university}`}>Sent {dayLabel(c.created_at)} · {c.status}</PageTitle>
      <Card className="flex flex-col gap-1 text-body">
        <p><strong>{c.requester}</strong>, {c.title} · <span className="font-mono">{c.email}</span></p>
        <p>University domains: {c.domains.join(", ")}</p>
        <p>Two-factor on: {c.has_two_factor ? "yes" : "no"}</p>
        {c.note ? <p>Note: {c.note}</p> : null}
        {letter ? <a className="font-semibold underline" href={letter} target="_blank" rel="noopener noreferrer">Open the letter (link works for 60 seconds)</a> : <p>The letter was deleted after the decision.</p>}
        {c.claimed ? <p className="font-semibold">This university already has an owner.</p> : null}
      </Card>
      {c.status === "pending" ? (
        <RpcForm testId="decide-claim" action={decideClaim as FormAction} extra={{ id }} after="/ops/universities" submitLabel="Record decision" fields={[
          { name: "approve", label: "Approve: make them the owner", type: "checkbox" },
          { name: "reason", label: "Reason (the requester reads it)", type: "text", required: true },
        ]} />
      ) : <p className="text-body">Decided: {c.review_reason}</p>}
    </main>
  );
}
