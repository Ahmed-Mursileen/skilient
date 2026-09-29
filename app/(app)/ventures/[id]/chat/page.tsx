import { LockSimple } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { getVentureChatId } from "@/lib/data/chat";

/** Venture Chat tab (PRD 5.28): members go to the group chat; others are told it's members only. */
export default async function VentureChatPage({ params }: PageProps<"/ventures/[id]/chat">) {
  const { id } = await params;
  const threadId = /^[0-9a-f-]{36}$/.test(id) ? await getVentureChatId(id) : null;
  if (threadId) redirect(`/chat/${threadId}` as Route);
  return (
    <EmptyState
      icon={<LockSimple aria-hidden className="size-8" />}
      title="The team's chat is for members"
      description="Join the venture to talk with the team."
    />
  );
}
