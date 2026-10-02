import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventCard } from "@/components/uni/event-card";
import { isRefusal } from "@/lib/data/rpc-json";
import { getEvent, type EventCard as Card } from "@/lib/data/uni";

export const metadata: Metadata = { title: "Event" };

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let e: Card;
  try {
    e = await getEvent(id);
  } catch (err) {
    if (isRefusal(err, "P0002", "42501")) notFound();
    throw err;
  }
  return (
    <main className="mx-auto flex w-full max-w-prose flex-col gap-6 px-[var(--page-gutter)] py-6">
      <EventCard e={e} detail />
    </main>
  );
}
