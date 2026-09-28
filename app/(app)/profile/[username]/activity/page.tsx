import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { FeedList } from "@/components/posts/feed-list";
import { EmptyState } from "@/components/ui";
import { listPosts } from "@/lib/data/posts";
import { getProfile } from "@/lib/data/profiles";

/** A person's posts that you can see (their university's feed or global), newest first. */
export default async function ProfileActivityPage({ params }: PageProps<"/profile/[username]/activity">) {
  const { username } = await params;
  const lookup = await getProfile(username);
  if (lookup.kind !== "full") return null;
  const { profile } = lookup;
  const page = await listPosts({ scope: "author", authorId: profile.userId });
  return (
    <FeedList
      initial={page.posts}
      cursor={page.cursor}
      scope="author"
      filter="all"
      authorId={profile.userId}
      empty={
        <EmptyState
          icon={<ClockCounterClockwise aria-hidden className="size-8" />}
          title="No posts yet"
          description={profile.isOwner ? "Your posts will show here." : `${profile.fullName}'s posts will show here.`}
        />
      }
    />
  );
}
