import "server-only";

import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { describeNotification } from "@/supabase/functions/_shared/notify/describe";

/**
 * Notifications for /notifications and settings (PRD 5.11). The read functions return
 * only the caller's own rows; wording comes from the same module the emails use.
 */

export interface NotificationItem {
  id: string;
  type: string;
  text: string;
  href: string;
  actorName: string | null;
  actorAvatarUrl: string | null;
  read: boolean;
  createdAt: string;
  /** "14:30" today, "12 Sep" before; formatted on the server. */
  timeLabel: string;
  today: boolean;
}

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" });

export const PAGE_SIZE = 50;

export async function getNotifications(before: string | null = null): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_notifications", { p_before: before ?? undefined, p_limit: PAGE_SIZE });
  if (error) throw new Error(`my_notifications failed: ${error.code}`);
  const todayKey = dayKey.format(new Date());
  return (data ?? []).map((n) => {
    const d = describeNotification({
      type: n.type,
      actorName: n.actor_name,
      entityType: n.entity_type,
      entityId: n.entity_id,
      data: (n.data ?? {}) as Record<string, unknown>,
    });
    return {
      id: n.id,
      type: n.type,
      text: d.text,
      href: d.href,
      actorName: n.actor_name,
      actorAvatarUrl: publicImageUrl("avatars", n.actor_avatar_path),
      read: n.read_at !== null,
      createdAt: n.created_at,
      today: dayKey.format(new Date(n.created_at)) === todayKey,
      timeLabel:
        dayKey.format(new Date(n.created_at)) === todayKey ? timeFormat.format(new Date(n.created_at)) : dateFormat.format(new Date(n.created_at)),
    };
  });
}

export type EmailChannel = "instant_email" | "digest" | "off";

export interface NotificationSetting {
  category: string;
  label: string;
  description: string;
  channel: EmailChannel;
  allowInstant: boolean;
}

export async function getNotificationSettings(): Promise<NotificationSetting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_notification_settings");
  if (error) throw new Error(`my_notification_settings failed: ${error.code}`);
  return (data ?? []).map((s) => ({
    category: s.category,
    label: s.label,
    description: s.description,
    channel: s.channel,
    allowInstant: s.allow_instant,
  }));
}
