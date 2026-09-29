import { ChatsCircle } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui";

/** Desktop placeholder beside the list; phones see only the list here. */
export default function ChatIndexPage() {
  return (
    <div className="hidden md:block">
      <EmptyState
        icon={<ChatsCircle aria-hidden className="size-8" />}
        title="Pick a conversation"
        description="Messages with friends and your venture teams show on the left."
      />
    </div>
  );
}
