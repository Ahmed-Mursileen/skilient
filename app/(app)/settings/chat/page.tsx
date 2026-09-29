import type { Metadata } from "next";
import { ReadReceiptsToggle } from "@/components/chat/read-receipts-toggle";
import { getChatSettings } from "@/lib/data/chat";

export const metadata: Metadata = { title: "Chat settings" };

/** /settings/chat (PRD 5.28): DM read receipts, on by default. */
export default async function ChatSettingsPage() {
  const settings = await getChatSettings();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <h1 className="font-display text-h1">Chat</h1>
      <div className="rounded-lg border border-border-default bg-bg-surface">
        <ReadReceiptsToggle initial={settings.readReceipts} />
      </div>
    </main>
  );
}
