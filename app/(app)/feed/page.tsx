import type { Metadata, Route } from "next";
import Link from "next/link";
import { EmptyState, Button } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Home" };

/** Home. The University and Global feeds arrive in phase 3; until then this is the landing spot after sign-in. */
export default async function FeedPage() {
  const user = await getCurrentUser();
  const firstName = user?.fullName.split(/\s+/)[0] ?? "there";
  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <div>
        <h1 className="font-display text-h1">Hi, {firstName}</h1>
        {user?.universityName ? <p className="mt-1 text-body text-text-secondary">{user.universityName}</p> : null}
      </div>
      <EmptyState
        title="Your university feed"
        description="Posts, ventures and announcements from your university will show up here."
        action={
          user?.username ? (
            <Button asChild variant="secondary">
              <Link href={`/profile/${user.username}` as Route}>View your profile</Link>
            </Button>
          ) : null
        }
      />
    </main>
  );
}
