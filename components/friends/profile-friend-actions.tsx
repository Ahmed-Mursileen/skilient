import { ConfirmAction } from "@/components/ventures/confirm-action";
import { Badge } from "@/components/ui";
import {
  blockUser,
  cancelFriendRequest,
  respondFriendRequest,
  sendFriendRequest,
  unblockUser,
  unfriend,
} from "@/lib/actions/friends";
import type { FriendshipState } from "@/lib/data/friends";

/**
 * Add friend / Request sent / Accept / Friends, and Block, on someone else's profile
 * (PRD 5.4, 5.8). Message arrives with chat and Report with moderation (phase 3 slices).
 */
export function ProfileFriendActions({
  username,
  fullName,
  state,
  requestId,
}: {
  username: string;
  fullName: string;
  state: Exclude<FriendshipState, "self">;
  requestId: string | null;
}) {
  const first = fullName.split(" ")[0] || fullName;
  const block = (
    <ConfirmAction
      action={blockUser.bind(null, username)}
      label="Block"
      variant="ghost"
      danger
      confirm={{
        title: `Block ${fullName}?`,
        description: `You'll stop seeing each other's profiles, posts and ventures, and any friendship or request between you ends. ${first} isn't told. In a venture you share, you'll see each other only as "Blocked member".`,
      }}
    />
  );

  if (state === "blocked") {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="friend-actions">
        <span className="text-body-sm text-text-secondary">You blocked {first}.</span>
        <ConfirmAction action={unblockUser.bind(null, username)} label="Unblock" variant="secondary" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="friend-actions">
      {state === "none" ? (
        <ConfirmAction action={sendFriendRequest.bind(null, username)} label="Add friend" variant="primary" />
      ) : null}
      {state === "sent" && requestId ? (
        <>
          <Badge>Request sent</Badge>
          <ConfirmAction action={cancelFriendRequest.bind(null, requestId)} label="Cancel request" variant="ghost" />
        </>
      ) : null}
      {state === "received" && requestId ? (
        <>
          <ConfirmAction action={respondFriendRequest.bind(null, requestId, true)} label="Accept request" variant="primary" />
          <ConfirmAction action={respondFriendRequest.bind(null, requestId, false)} label="Decline" variant="ghost" />
        </>
      ) : null}
      {state === "friends" ? (
        <>
          <Badge tone="success">Friends</Badge>
          <ConfirmAction
            action={unfriend.bind(null, username)}
            label="Unfriend"
            variant="secondary"
            confirm={{
              title: `Unfriend ${fullName}?`,
              description: "You'll go back to being strangers. Either of you can send a new request later.",
            }}
          />
        </>
      ) : null}
      {block}
    </div>
  );
}
