import { ShieldWarning } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";
import { getMyModerationNotice } from "@/lib/data/ops";

export const metadata: Metadata = { title: "Moderation decision" };

const NOUNS: Record<string, string> = { post: "post", comment: "comment", message: "message", profile: "profile", venture: "venture" };

/** What a moderation notification refers to: the content and the reason, never who reported or decided. */
export default async function ModerationNoticePage({ params }: PageProps<"/moderation/[id]">) {
  const { id } = await params;
  const notice = await getMyModerationNotice(id);
  if (!notice) {
    return <EmptyState icon={<ShieldWarning aria-hidden className="size-8" />} title="Nothing to show" description="This decision isn't about your content, or it no longer applies." />;
  }
  const noun = NOUNS[notice.targetType] ?? "content";
  const { title, body } =
    notice.action === "clear_profile"
      ? { title: "Your profile's bio and photo were removed", body: "A Skilient moderator found that they broke the community guidelines. The rest of your profile is unchanged; you can add a new bio and photo that follow the guidelines." }
      : notice.action === "unlist"
        ? { title: "Your venture was unlisted", body: "A Skilient moderator found that it broke the community guidelines. It no longer appears in browse or search; your team keeps access." }
        : notice.status === "removed"
          ? { title: `Your ${noun} was removed`, body: "A Skilient moderator found that it broke the community guidelines, so nobody can see it any more." }
          : { title: `A warning about your ${noun}`, body: "A Skilient moderator found that it broke the community guidelines. It's still up, but repeated problems can lead to a suspension." };
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-[var(--page-gutter)] py-8">
      <h1 className="font-display text-h1">{title}</h1>
      <p className="text-body text-text-secondary">{body}</p>
      {notice.excerpt ? (
        <blockquote className="rounded-md border-l-2 border-border-strong bg-bg-subtle px-4 py-3 text-body break-words whitespace-pre-wrap">{notice.excerpt}</blockquote>
      ) : null}
      {notice.reason ? (
        <p className="text-body">
          <span className="font-semibold">Moderator&apos;s reason:</span> {notice.reason}
        </p>
      ) : null}
      <p className="text-body-sm text-text-secondary">Appeals open with the next update to Skilient&apos;s moderation tools.</p>
    </main>
  );
}
