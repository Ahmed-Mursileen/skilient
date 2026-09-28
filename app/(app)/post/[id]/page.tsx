import { EyeSlash } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Comments } from "@/components/posts/comments";
import { PostCard } from "@/components/posts/post-card";
import { Button, EmptyState } from "@/components/ui";
import { getComments, getPost } from "@/lib/data/posts";

export const metadata: Metadata = { title: "Post" };

/** /post/[id] (screen spec 3.3): one post, or why you can't see it. */
export default async function PostPage({ params }: PageProps<"/post/[id]">) {
  const { id } = await params;
  const post = await getPost(id);
  const comments = post ? await getComments(post.id) : [];
  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-5 px-[var(--page-gutter)] py-8">
      <h1 className="sr-only">Post</h1>
      {post ? (
        <>
          <PostCard post={post} showCommentsLink={false} />
          <Comments postId={post.id} comments={comments} isPostAuthor={post.isMine} />
        </>
      ) : (
        <EmptyState
          icon={<EyeSlash aria-hidden className="size-8" />}
          title="This post isn't available"
          description="It was deleted, or it's shared with another university's feed."
          action={
            <Button asChild variant="secondary">
              <Link href="/feed">Back to your feed</Link>
            </Button>
          }
        />
      )}
    </main>
  );
}
