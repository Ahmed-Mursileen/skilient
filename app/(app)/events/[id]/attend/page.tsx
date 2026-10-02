import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/uni/page-parts";
import { checkIn } from "@/lib/actions/uni";

export const metadata: Metadata = { title: "Check in" };
export const dynamic = "force-dynamic";

/** /events/[id]/attend?t= : where the scanned code lands; checks the student in (or says why not). */
export default async function AttendPage({ params, searchParams }: PageProps<"/events/[id]/attend">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const result = await checkIn({ id, token: typeof sp.t === "string" ? sp.t : "" });
  return (
    <main className="mx-auto flex w-full max-w-prose flex-col gap-4 px-[var(--page-gutter)] py-10 text-center" data-testid="attend">
      <PageTitle title={result.ok ? (result.data === "already" ? "You're already checked in" : "You're checked in") : "Check-in didn't work"}>
        {result.ok ? "Enjoy the event." : result.message}
      </PageTitle>
      <Link className="underline" href={`/events/${id}` as Route}>Back to the event</Link>
    </main>
  );
}
