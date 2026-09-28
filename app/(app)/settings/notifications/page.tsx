import type { Metadata } from "next";
import { ChannelPicker } from "@/components/notifications/channel-picker";
import { getNotificationSettings } from "@/lib/data/notifications";

export const metadata: Metadata = { title: "Notification settings" };

/** /settings/notifications (screen spec 3.10): per category, instant email / daily digest / off. */
export default async function NotificationSettingsPage() {
  const settings = await getNotificationSettings();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Notifications</h1>
        <p className="mt-1 text-body text-text-secondary">
          Everything always shows under the bell. Choose what also reaches your inbox: straight away, in one daily
          email (only when you haven&apos;t been on Skilient for a day), or not at all. Instant email is kept for things
          that need an answer.
        </p>
      </div>
      <div className="divide-y divide-border-muted overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        {settings.map((s) => (
          <ChannelPicker key={s.category} {...s} />
        ))}
      </div>
    </main>
  );
}
