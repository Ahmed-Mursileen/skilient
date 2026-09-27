import { Rocket } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui";
import { getProfile } from "@/lib/data/profiles";

export default async function ProfileVenturesPage({ params }: PageProps<"/profile/[username]/ventures">) {
  const { username } = await params;
  const lookup = await getProfile(username);
  if (lookup.kind !== "full") return null;
  return (
    <EmptyState
      icon={<Rocket aria-hidden className="size-8" />}
      title="No ventures yet"
      description={
        lookup.profile.isOwner
          ? "Projects you build with others show here with your role. Finished ventures count most toward your rank."
          : `Ventures ${lookup.profile.fullName} builds with others will show here.`
      }
    />
  );
}
