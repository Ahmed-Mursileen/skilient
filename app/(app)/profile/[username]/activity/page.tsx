import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui";
import { getProfile } from "@/lib/data/profiles";

export default async function ProfileActivityPage({ params }: PageProps<"/profile/[username]/activity">) {
  const { username } = await params;
  const lookup = await getProfile(username);
  if (lookup.kind !== "full") return null;
  return (
    <EmptyState
      icon={<ClockCounterClockwise aria-hidden className="size-8" />}
      title="No activity yet"
      description={
        lookup.profile.isOwner ? "Your posts and contributions will show here." : `${lookup.profile.fullName}'s posts and contributions will show here.`
      }
    />
  );
}
