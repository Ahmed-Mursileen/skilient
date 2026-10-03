import type { Metadata } from "next";
import { ThreadList } from "@/components/chat/thread-list";
import { getThreads } from "@/lib/data/chat";

export const metadata: Metadata = { title: "Chat" };

/** /chat (screen spec 3.5): phone shows the list or the open thread; desktop shows both. */
export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const threads = await getThreads();
  return (
    // data-ph-block: never in a replay, even for the moment before recording pauses on this route.
    <main data-ph-block className="mx-auto grid w-full max-w-page gap-4 px-[var(--page-gutter)] py-6 md:grid-cols-[320px_minmax(0,1fr)]">
      <h1 className="sr-only">Chat</h1>
      <ThreadList threads={threads} />
      <div className="min-w-0">{children}</div>
    </main>
  );
}
