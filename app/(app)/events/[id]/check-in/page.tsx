import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckinScreen } from "@/components/uni/checkin-screen";
import { PageTitle } from "@/components/uni/page-parts";
import { isRefusal } from "@/lib/data/rpc-json";
import { getEvent, type EventCard } from "@/lib/data/uni";

export const metadata: Metadata = { title: "Check-in" };

/** /events/[id]/check-in (PRD 5.23): for the organiser's screen at the door. */
export default async function CheckinPage({ params }: PageProps<"/events/[id]/check-in">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let e: EventCard;
  try {
    e = await getEvent(id);
  } catch (err) {
    if (isRefusal(err, "P0002", "42501")) notFound();
    throw err;
  }
  if (!e.can_organise) notFound();
  return (
    <main className="mx-auto flex w-full max-w-prose flex-col items-center gap-6 px-[var(--page-gutter)] py-6 text-center">
      <PageTitle title={e.title}>Point your phone camera at the code to check in.</PageTitle>
      <CheckinScreen eventId={id} />
    </main>
  );
}
