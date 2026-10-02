import type { Metadata } from "next";
import { DataTable, PageTitle, Section } from "@/components/uni/page-parts";
import { Badge } from "@/components/ui";
import { RpcForm, type FormAction } from "@/components/uni/rpc-form";
import { hideContent } from "@/lib/actions/uni";
import { getModeration, getRecentFeed } from "@/lib/data/uni";
import { ageLabel } from "@/lib/format/time";

export const metadata: Metadata = { title: "Moderation" };

const STATUS: Record<string, string> = { hidden: "Hidden, waiting for Skilient", restored: "Restored by Skilient", removed: "Removed by Skilient" };

/**
 * /uni/moderation (PRD 5.23): what your admins hid and every report on your University Feed.
 * Hide from the post's menu in the feed; Skilient makes the final decision. Reporters are never shown.
 */
export default async function ModerationPage() {
  const [m, feed] = await Promise.all([getModeration(), getRecentFeed()]);
  return (
    <main className="flex flex-col gap-8">
      <PageTitle title="Moderation">Hide a post or comment from your University Feed below. It disappears at once, its author is told why, and Skilient decides. Suspensions stay with Skilient.</PageTitle>
      <Section title="Hidden by your university" id="h-h">
        <DataTable testId="hides" head={["Content", "Reason", "By", "When", "Status"]} empty="Nothing hidden."
          rows={m.hides.map((h) => [h.excerpt || h.target_type, h.reason, h.hidden_by ?? "", ageLabel(h.created_at), <Badge key="s" tone={h.status === "hidden" ? "warning" : "neutral"}>{STATUS[h.status] ?? h.status}</Badge>])} />
      </Section>
      <Section title="Recent posts in your University Feed" id="f-h">
        <DataTable testId="recent-posts" head={["Post", "Author", "When", "Hide"]} empty="No posts yet."
          rows={feed.posts.map((p) => [p.excerpt, p.author, ageLabel(p.created_at), p.hidden ? <Badge key="h">Hidden</Badge> : (
            <RpcForm key="f" action={hideContent as FormAction} extra={{ type: "post", id: p.id }} submitLabel="Hide" fields={[{ name: "reason", label: "Reason (the author sees it)", type: "text", required: true }]} />
          )])} />
      </Section>
      <Section title="Recent comments" id="cm-h">
        <DataTable head={["Comment", "Author", "When", "Hide"]} empty="No comments yet."
          rows={feed.comments.map((c) => [c.excerpt, c.author, ageLabel(c.created_at), c.hidden ? <Badge key="h">Hidden</Badge> : (
            <RpcForm key="f" action={hideContent as FormAction} extra={{ type: "comment", id: c.id }} submitLabel="Hide" fields={[{ name: "reason", label: "Reason (the author sees it)", type: "text", required: true }]} />
          )])} />
      </Section>
      <Section title="Reports on your feed" id="r-h">
        <DataTable head={["Content", "Category", "Reports", "Opened", "Status"]} empty="No reports."
          rows={m.cases.map((c) => [c.excerpt || c.target_type, c.category ?? "University hide", c.reports, ageLabel(c.opened_at), c.status])} />
      </Section>
    </main>
  );
}
