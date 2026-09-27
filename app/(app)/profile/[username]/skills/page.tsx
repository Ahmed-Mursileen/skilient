import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui";
import { getProfile } from "@/lib/data/profiles";

/** Skills tab: verified skills arrive with GitHub evidence (phase 2). L0 skills are never shown to others. */
export default async function ProfileSkillsPage({ params }: PageProps<"/profile/[username]/skills">) {
  const { username } = await params;
  const lookup = await getProfile(username);
  if (lookup.kind !== "full") return null;
  return (
    <EmptyState
      icon={<Sparkle aria-hidden className="size-8" />}
      title="No verified skills yet"
      description={
        lookup.profile.isOwner
          ? "Skills appear here with their level once your GitHub work is connected and verified."
          : `${lookup.profile.fullName}'s verified skills will show here, each with its evidence.`
      }
    />
  );
}
