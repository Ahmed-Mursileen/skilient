import { ChatsCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Conversation } from "@/components/chat/conversation";
import { Button, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getThread } from "@/lib/data/chat";

/** /chat/[threadId] (screen spec 3.5, 3.13): members only; anyone else is told it isn't available. */
export default async function ThreadPage({ params }: PageProps<"/chat/[threadId]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  const { threadId } = await params;
  const view = await getThread(threadId);
  if (!view) {
    return (
      <EmptyState
        icon={<ChatsCircle aria-hidden className="size-8" />}
        title="This chat isn't available"
        description="You're not in this conversation, or it has been closed."
        action={
          <Button asChild variant="secondary">
            <Link href="/chat">All chats</Link>
          </Button>
        }
      />
    );
  }
  return (
    <Conversation
      key={view.thread.id}
      thread={view.thread}
      people={view.people}
      initial={view.messages}
      hasOlder={view.hasOlder}
      meId={user.id}
    />
  );
}
