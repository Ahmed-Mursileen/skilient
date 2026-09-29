/**
 * What a notification says and where it leads, shared by /notifications (Next) and the
 * notify-worker emails (Deno): plain TypeScript, no runtime globals, relative imports.
 */

export interface NotificationInput {
  type: string;
  /** The actor's name, or null for system events and people you can't see. */
  actorName: string | null;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

export interface NotificationText {
  /** One sentence, no trailing period needed in lists (it has one). */
  text: string;
  /** App path to open (no origin). */
  href: string;
  /** Email subject line. */
  subject: string;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function excerpt(data: Record<string, unknown>): string {
  const text = str(data.excerpt) ?? "";
  return text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text;
}

function postPath(data: Record<string, unknown>): string {
  const id = str(data.post_id);
  return id ? `/post/${id}#comments` : "/feed";
}

function targetWord(value: unknown): string {
  switch (value) {
    case "post":
      return "post";
    case "comment":
      return "comment";
    case "message":
      return "message";
    case "venture":
      return "venture";
    default:
      return "profile";
  }
}

export function describeNotification(n: NotificationInput): NotificationText {
  const who = n.actorName ?? "Someone";
  const venture = str(n.data.venture_title) ?? "a venture";
  const ventureId = str(n.data.venture_id);
  const venturePath = ventureId ? `/ventures/${ventureId}` : "/ventures";

  switch (n.type) {
    case "friend_request":
      return { text: `${who} sent you a friend request.`, href: "/friends?tab=received", subject: `${who} wants to be your friend on Skilient` };
    case "friend_accepted":
      return { text: `${who} accepted your friend request.`, href: "/friends", subject: `${who} accepted your friend request` };
    case "application_received":
      return { text: `${who} applied to join ${venture}.`, href: "/requests", subject: `New application to ${venture}` };
    case "application_decided": {
      const status = str(n.data.status);
      if (status === "accepted") {
        return { text: `You're in: your application to ${venture} was accepted.`, href: venturePath, subject: `You've joined ${venture}` };
      }
      if (status === "closed") {
        return { text: `${venture} is no longer taking applications, so yours was closed.`, href: "/requests?tab=sent", subject: `Your application to ${venture} was closed` };
      }
      return { text: `Your application to ${venture} wasn't accepted this time.`, href: "/requests?tab=sent", subject: `An update on your application to ${venture}` };
    }
    case "application_withdrawn":
      return { text: `${who} withdrew their application to ${venture}.`, href: "/requests", subject: `An application to ${venture} was withdrawn` };
    case "invite_received":
      return { text: `${who} invited you to join ${venture}.`, href: "/requests?tab=invites", subject: `${who} invited you to join ${venture}` };
    case "invite_answered": {
      const accepted = str(n.data.status) === "accepted";
      return {
        text: accepted ? `${who} accepted your invite to ${venture}.` : `${who} declined your invite to ${venture}.`,
        href: venturePath,
        subject: accepted ? `${who} joined ${venture}` : `${who} declined your invite`,
      };
    }
    case "ownership_transferred":
      return str(n.data.role) === "old_owner"
        ? { text: `You no longer own ${venture}.`, href: venturePath, subject: `Ownership of ${venture} changed` }
        : { text: `You're now the owner of ${venture}.`, href: venturePath, subject: `You now own ${venture}` };
    case "member_left":
      return { text: `${who} left ${venture}.`, href: `${venturePath}/team`, subject: `${who} left ${venture}` };
    case "member_removed":
      return { text: `You were removed from ${venture}.`, href: venturePath, subject: `You were removed from ${venture}` };
    case "venture_completed":
      return { text: `${venture} is complete. Well done.`, href: venturePath, subject: `${venture} is complete` };
    case "comment_received":
      return { text: `${who} commented on your post: "${excerpt(n.data)}"`, href: postPath(n.data), subject: `${who} commented on your post` };
    case "comment_reply":
      return { text: `${who} replied to your comment: "${excerpt(n.data)}"`, href: postPath(n.data), subject: `${who} replied to your comment` };
    case "comment_mention":
      return { text: `${who} mentioned you in a comment: "${excerpt(n.data)}"`, href: postPath(n.data), subject: `${who} mentioned you on Skilient` };
    case "content_removed": {
      const what = targetWord(n.data.target_type);
      if (n.data.action === "cleared") {
        return {
          text: "A moderator removed your profile's bio and photo for breaking the community guidelines.",
          href: `/moderation/${n.entityId}`,
          subject: "Your profile's bio and photo were removed",
        };
      }
      if (n.data.action === "unlisted") {
        return {
          text: "A moderator unlisted your venture for breaking the community guidelines.",
          href: `/moderation/${n.entityId}`,
          subject: "Your venture was unlisted on Skilient",
        };
      }
      return {
        text: `A moderator removed your ${what} for breaking the community guidelines.`,
        href: `/moderation/${n.entityId}`,
        subject: `Your ${what} was removed from Skilient`,
      };
    }
    case "moderation_warning": {
      const what = targetWord(n.data.target_type);
      return {
        text: `A moderator sent you a warning about your ${what}.`,
        href: `/moderation/${n.entityId}`,
        subject: "A warning from Skilient moderators",
      };
    }
    case "chat_message": {
      const thread = str(n.data.thread_id);
      const where = str(n.data.venture_title);
      return {
        text: where ? `${who} in ${where}: "${excerpt(n.data)}"` : `${who} sent you a message: "${excerpt(n.data)}"`,
        href: thread ? `/chat/${thread}` : "/chat",
        subject: where ? `New messages in ${where}` : `${who} sent you a message`,
      };
    }
    case "venture_abandoned":
      return { text: `${venture} was closed without finishing.`, href: venturePath, subject: `${venture} was closed` };
    default:
      return { text: "You have a new notification.", href: "/notifications", subject: "New activity on Skilient" };
  }
}
