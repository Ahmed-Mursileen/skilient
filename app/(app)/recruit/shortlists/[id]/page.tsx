import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShortlistBoard } from "@/components/recruit/shortlist-board";
import { EmptyState } from "@/components/ui";
import { getMyOrg, getOrgJobs, getShortlist } from "@/lib/data/recruit";
import { isRefusal } from "@/lib/data/rpc-json";

export const metadata: Metadata = { title: "Shortlist" };

export default async function ShortlistPage({ params }: PageProps<"/recruit/shortlists/[id]">) {
  const { id } = await params;
  const org = await getMyOrg();
  if (org?.status !== "verified") notFound();
  const list = await getShortlist(id).catch((err: unknown) => {
    if (isRefusal(err, "P0002", "22P02")) return null;
    throw err;
  });
  if (!list) notFound();
  const jobs = await getOrgJobs();
  return (
    <main className="flex flex-col gap-4">
      <p><Link href={"/recruit/shortlists" as Route} className="text-body-sm font-semibold underline underline-offset-4">All lists</Link></p>
      <h1 className="font-display text-h1">{list.name}</h1>
      {list.items.length === 0 ? (
        <EmptyState title="This list is empty" description="Open a candidate from Talent and add them here." />
      ) : (
        <ShortlistBoard listId={id} name={list.name} items={list.items} jobs={jobs.jobs.filter((j) => j.status === "live").map((j) => ({ id: j.id, title: j.title }))} />
      )}
    </main>
  );
}
