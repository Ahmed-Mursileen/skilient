/**
 * notify-worker: drains the `notification_emails` queue (PRD 5.11) and sends through
 * Resend. Shared by the Edge Function (Deno) and its tests (Node): web APIs only.
 *
 * Budget (Resend free plan, ~100/day, shared with Supabase Auth's emails): instant emails
 * only for categories that allow them (checked again here), digests only when there is
 * something unread, and notification emails stop for the day at 60 (decisions.md
 * 2026-09-30) so verification codes, magic links and security emails, which go through
 * Supabase's SMTP and never through this queue, always have room. Both the stop and a
 * quota refusal park the queue until the next UTC day.
 */
import type { Db, Fetch, Log } from "../github/types.ts";
import { describeNotification } from "./describe.ts";
import { digestEmail, instantEmail, teacherDigestEmail, universityLaunchEmail, type EmailMessage } from "./email.ts";

export interface NotifyConfig {
  resendApiKey: string;
  /** Verified sender, e.g. "Skilient <notify@send.techshiner.tech>". */
  from: string;
  /** Public app origin for links, no trailing slash. */
  appUrl: string;
  /** https://api.resend.com (overridden in tests). */
  resendUrl: string;
  /** Gap between sends; Resend allows 2 requests a second. */
  sendGapMs: number;
}

export function notifyConfigFromEnv(env: (name: string) => string | undefined): NotifyConfig {
  const required = (name: string) => {
    const value = env(name);
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  return {
    resendApiKey: required("RESEND_API_KEY"),
    from: required("EMAIL_FROM"),
    appUrl: required("APP_URL").replace(/\/$/, ""),
    resendUrl: (env("RESEND_API_URL") ?? "https://api.resend.com").replace(/\/$/, ""),
    sendGapMs: 600,
  };
}

/** Notification emails a UTC day may send before the rest wait for tomorrow (Ahmed, 2026-09-30). */
export const DAILY_CAP = 60;
/** An instant email this old is no longer instant: it stays in-app only. */
const STALE_MS = 12 * 60 * 60 * 1000;
const DIGEST_ITEMS = 20;
const MAX_ATTEMPTS = 5;

interface QueueRow {
  msg_id: number | string;
  read_ct: number;
  message: { kind?: string; notification_id?: string; user_id?: string; request_id?: string };
}

/** Resend's error body: { statusCode, message, name } (its SDK's ErrorResponse). */
interface ResendError {
  statusCode?: number | null;
  message?: string;
  name?: string;
}

type SendResult =
  | { ok: true; id: string }
  | { ok: false; retry: "later" | "tomorrow" | "never"; name: string; status: number };

export async function sendViaResend(cfg: NotifyConfig, fetchImpl: Fetch, email: EmailMessage, idempotencyKey: string): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.resendUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from: cfg.from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, retry: "later", name: "network_error", status: 0 };
  }
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id ?? "" };
  }
  const err = (await res.json().catch(() => ({}))) as ResendError;
  const name = err.name ?? "application_error";
  if (name === "daily_quota_exceeded" || name === "monthly_quota_exceeded") {
    return { ok: false, retry: "tomorrow", name, status: res.status };
  }
  if (res.status === 429 || res.status >= 500) return { ok: false, retry: "later", name, status: res.status };
  // 4xx: the message itself is wrong (address, sender, fields); retrying won't help.
  return { ok: false, retry: "never", name, status: res.status };
}

export interface NotifyRunResult {
  sent: number;
  skipped: number;
  deferred: number;
  failed: number;
}

export async function runNotifyWorker(opts: {
  db: Db;
  cfg: NotifyConfig;
  fetch: Fetch;
  log: Log;
  now?: () => Date;
  batch?: number;
}): Promise<NotifyRunResult> {
  const { db, cfg, log } = opts;
  const now = opts.now ?? (() => new Date());
  const result: NotifyRunResult = { sent: 0, skipped: 0, deferred: 0, failed: 0 };
  const rows = await db.query<QueueRow>(
    "select msg_id, read_ct, message from pgmq.read('notification_emails', 120, $1::integer)",
    [opts.batch ?? 20],
  );

  const archive = (id: QueueRow["msg_id"]) => db.query("select pgmq.archive('notification_emails', $1::bigint)", [id]);
  const deferUntil = (id: QueueRow["msg_id"], seconds: number) =>
    db.query("select pgmq.set_vt('notification_emails', $1::bigint, $2::integer)", [id, Math.max(1, Math.ceil(seconds))]);

  const sentToday = async () => {
    const [{ today }] = await db.query<{ today: number }>(
      "select count(*)::integer as today from private.email_sends where sent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'",
    );
    return today;
  };
  const parkUntilTomorrow = async () => {
    const midnight = new Date(now());
    midnight.setUTCHours(24, 5, 0, 0);
    const wait = (midnight.getTime() - now().getTime()) / 1000;
    await db.query("select pgmq.set_vt('notification_emails', msg_id, $1::integer) from pgmq.q_notification_emails", [Math.ceil(wait)]);
  };

  let first = true;
  for (const row of rows) {
    const kind = row.message?.kind;
    const today = await sentToday();
    if (today >= DAILY_CAP) {
      await parkUntilTomorrow();
      result.deferred++;
      log("notify.daily_cap", { level: "warn", outcome: "refused", daily_count: today, cap: DAILY_CAP });
      break;
    }
    let email: EmailMessage | null = null;
    let key = "";
    let userId: string | null = null;
    let notificationId: string | null = null;

    if (kind === "instant" && row.message.notification_id) {
      notificationId = row.message.notification_id;
      const built = await buildInstant(db, cfg, notificationId, now());
      if ("skip" in built) {
        await archive(row.msg_id);
        result.skipped++;
        log("notify.skipped", { outcome: "ok", reason: built.skip, notification_id: notificationId });
        continue;
      }
      ({ email, userId } = built);
      key = `notification-${notificationId}`;
    } else if (kind === "digest" && row.message.user_id) {
      userId = row.message.user_id;
      const built = await buildDigest(db, cfg, userId, now());
      if ("skip" in built) {
        await archive(row.msg_id);
        result.skipped++;
        log("notify.skipped", { outcome: "ok", reason: built.skip, kind: "digest" });
        continue;
      }
      email = built.email;
      key = `digest-${userId}-${now().toISOString().slice(0, 10)}`;
    } else if (kind === "teacher_digest" && row.message.user_id) {
      // The teacher portal's one weekly email (PRD 5.21), instead of per-event emails.
      userId = row.message.user_id;
      const built = await buildTeacherDigest(db, cfg, userId);
      if ("skip" in built) {
        await archive(row.msg_id);
        result.skipped++;
        log("notify.skipped", { outcome: "ok", reason: built.skip, kind: "teacher_digest" });
        continue;
      }
      email = built.email;
      key = `teacher-digest-${userId}-${now().toISOString().slice(0, 10)}`;
    } else if (kind === "university_launch" && row.message.request_id) {
      // A requester's university went live (PRD 5.1): the one launch email, queued by the live_at trigger.
      const [r] = await db.query<{ email: string; university: string }>("select email, university from private.university_launch_email($1::uuid)", [
        row.message.request_id,
      ]);
      if (!r) {
        await archive(row.msg_id);
        result.skipped++;
        log("notify.skipped", { outcome: "ok", reason: "not_wanted", kind: "university_launch" });
        continue;
      }
      email = universityLaunchEmail(r.email, cfg.appUrl, r.university);
      key = `university-launch-${row.message.request_id}`;
    } else {
      await archive(row.msg_id);
      result.skipped++;
      log("notify.skipped", { outcome: "refused", reason: "bad_message" });
      continue;
    }

    if (!first && cfg.sendGapMs > 0) await new Promise((r) => setTimeout(r, cfg.sendGapMs));
    first = false;
    const sent = await sendViaResend(cfg, opts.fetch, email, key);
    if (sent.ok) {
      await db.query("insert into private.email_sends (kind, user_id, notification_id, resend_id) values ($1, $2::uuid, $3::uuid, $4)", [
        kind === "instant" ? "instant" : "digest",
        userId,
        notificationId,
        sent.id,
      ]);
      if (kind === "digest") {
        await db.query(
          `insert into private.user_activity (user_id, last_active_at, last_digest_at) values ($1::uuid, '-infinity', now())
           on conflict (user_id) do update set last_digest_at = now()`,
          [userId],
        );
      }
      await archive(row.msg_id);
      result.sent++;
      log("notify.sent", { outcome: "ok", kind, daily_count: today + 1 });
      continue;
    }

    if (sent.retry === "tomorrow") {
      // Park this and every other message until the quota resets at 00:00 UTC.
      await parkUntilTomorrow();
      result.deferred++;
      log("notify.quota", { level: "error", outcome: "error", error_code: sent.name });
      break;
    }
    if (sent.retry === "later" && row.read_ct < MAX_ATTEMPTS) {
      await deferUntil(row.msg_id, 30 * row.read_ct);
      result.deferred++;
      log("notify.deferred", { level: "warn", outcome: "error", error_code: sent.name, attempt: row.read_ct });
      if (sent.status === 429) break;
      continue;
    }
    await archive(row.msg_id);
    result.failed++;
    log("notify.failed", { level: "error", outcome: "error", error_code: sent.name, status: sent.status, kind });
  }
  return result;
}

interface InstantRow {
  id: string;
  user_id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string | Date;
  email: string | null;
  actor_name: string | null;
  channel: string | null;
  blocked: boolean;
}

async function buildInstant(
  db: Db,
  cfg: NotifyConfig,
  id: string,
  now: Date,
): Promise<{ skip: string } | { email: EmailMessage; userId: string }> {
  const [n] = await db.query<InstantRow>(
    `select n.id, n.user_id, n.type, n.entity_type, n.entity_id, n.data, n.read_at, n.created_at, u.email,
            ap.full_name as actor_name,
            private.email_channel_for(n.user_id, n.type)::text as channel,
            (n.actor_id is not null and private.is_blocked(n.user_id, n.actor_id)) as blocked
       from public.notifications n
       join auth.users u on u.id = n.user_id
       left join public.profiles ap on ap.user_id = n.actor_id
      where n.id = $1::uuid`,
    [id],
  );
  if (!n) return { skip: "gone" };
  if (n.read_at) return { skip: "already_read" };
  if (n.blocked) return { skip: "blocked" };
  if (n.channel !== "instant_email") return { skip: "not_instant" };
  if (!n.email) return { skip: "no_address" };
  if (now.getTime() - new Date(n.created_at).getTime() > STALE_MS) return { skip: "stale" };
  const d = describeNotification({ type: n.type, actorName: n.actor_name, entityType: n.entity_type, entityId: n.entity_id, data: n.data ?? {} });
  return { email: instantEmail(n.email, cfg.appUrl, d), userId: n.user_id };
}

async function buildDigest(
  db: Db,
  cfg: NotifyConfig,
  userId: string,
  now: Date,
): Promise<{ skip: string } | { email: EmailMessage }> {
  const [who] = await db.query<{ email: string | null; last_active_at: string | Date | null; last_digest_at: string | Date | null }>(
    `select u.email, a.last_active_at, a.last_digest_at
       from auth.users u left join private.user_activity a on a.user_id = u.id
      where u.id = $1::uuid`,
    [userId],
  );
  if (!who?.email) return { skip: "no_address" };
  if (who.last_active_at && now.getTime() - new Date(who.last_active_at).getTime() < 24 * 60 * 60 * 1000) {
    return { skip: "active" };
  }
  if (who.last_digest_at && now.getTime() - new Date(who.last_digest_at).getTime() < 20 * 60 * 60 * 1000) {
    return { skip: "already_sent_today" };
  }
  const items = await db.query<{ type: string; entity_type: string; entity_id: string; data: Record<string, unknown>; actor_name: string | null; total: number }>(
    `select n.type, n.entity_type, n.entity_id, n.data, ap.full_name as actor_name, count(*) over ()::integer as total
       from public.notifications n
       left join private.user_activity a on a.user_id = n.user_id
       left join public.profiles ap on ap.user_id = n.actor_id
      where n.user_id = $1::uuid
        and n.read_at is null
        and n.created_at > coalesce(a.last_digest_at, '-infinity'::timestamptz)
        and private.email_channel_for(n.user_id, n.type) = 'digest'
        and (n.actor_id is null or not private.is_blocked(n.user_id, n.actor_id))
      order by n.created_at desc
      limit ${DIGEST_ITEMS}`,
    [userId],
  );
  if (!items.length) return { skip: "empty" };
  const lines = items.map((i) => {
    const d = describeNotification({ type: i.type, actorName: i.actor_name, entityType: i.entity_type, entityId: i.entity_id, data: i.data ?? {} });
    return { text: d.text, href: d.href };
  });
  return { email: digestEmail(who.email, cfg.appUrl, lines, Math.max(0, items[0].total - items.length)) };
}

async function buildTeacherDigest(db: Db, cfg: NotifyConfig, userId: string): Promise<{ skip: string } | { email: EmailMessage }> {
  const [who] = await db.query<{ email: string | null; digest: boolean | null; counts: Record<string, number> | null }>(
    `select u.email, coalesce(s.digest, true) as digest, private.teacher_digest_data(u.id) as counts
       from auth.users u
       join public.teacher_profiles t on t.user_id = u.id and t.status = 'approved'
       left join public.teacher_settings s on s.user_id = u.id
      where u.id = $1::uuid`,
    [userId],
  );
  if (!who?.email) return { skip: "no_address" };
  if (who.digest === false) return { skip: "opted_out" };
  const counts = who.counts ?? {};
  const total = Object.values(counts).reduce((n, v) => n + Number(v), 0);
  if (total === 0) return { skip: "empty" };
  return { email: teacherDigestEmail(who.email, cfg.appUrl, counts) };
}
