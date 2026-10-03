/**
 * analytics-worker: sends the analytics outbox (pgmq `analytics`, written by database triggers) to
 * PostHog EU (PRD 10 "Product analytics"; phase 13 slice 1). Captures go in one batch call; a
 * failed batch stays queued and is retried when its visibility timeout ends, and is dropped after
 * MAX_TRIES. Events listed in `analytics.muted_events` are dropped unsent (quota guard). Deletions
 * remove the person, their events and their recordings through PostHog's API; they are retried
 * hourly until they succeed, never dropped.
 *
 * Properties are checked again here: only short ids, enums, numbers and booleans leave, whatever a
 * trigger wrote.
 */
import type { Db, Fetch, Log } from "../github/types.ts";

export interface AnalyticsConfig {
  /** Capture host, e.g. https://eu.i.posthog.com */
  host: string;
  /** Project API key (`phc_…`), public by design. */
  projectKey: string;
  /** Private API host for deletions, e.g. https://eu.posthog.com */
  apiHost: string | null;
  projectId: string | null;
  personalKey: string | null;
}

const EU_CAPTURE = /^https:\/\/eu\.i\.posthog\.com$/;
const EU_API = /^https:\/\/eu\.posthog\.com$/;

/** PRD 10: the PostHog project is in the EU region; anything else is a configuration error. */
export function analyticsConfigFromEnv(env: (name: string) => string | undefined): AnalyticsConfig {
  const projectKey = env("POSTHOG_PROJECT_KEY");
  if (!projectKey || !/^phc_[A-Za-z0-9]+$/.test(projectKey)) throw new Error("POSTHOG_PROJECT_KEY is not set");
  const host = (env("POSTHOG_HOST") ?? "https://eu.i.posthog.com").replace(/\/$/, "");
  if (!EU_CAPTURE.test(host)) throw new Error("POSTHOG_HOST must be PostHog EU");
  const apiHost = (env("POSTHOG_API_HOST") ?? "https://eu.posthog.com").replace(/\/$/, "");
  if (!EU_API.test(apiHost)) throw new Error("POSTHOG_API_HOST must be PostHog EU");
  const projectId = env("POSTHOG_PROJECT_ID") ?? null;
  return {
    host,
    projectKey,
    apiHost,
    projectId: projectId && /^\d+$/.test(projectId) ? projectId : null,
    personalKey: env("POSTHOG_PERSONAL_API_KEY") || null,
  };
}

export const MAX_TRIES = 5;
/** Seconds a failed deletion waits before the next try. */
const DELETE_RETRY_S = 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT = /^(\$set|[a-z][a-z0-9_]{2,40})$/;
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
/** Enum values, plan ids, uuids, ISO weeks: no spaces, no "@", short. */
const SAFE_STRING = /^[A-Za-z0-9_.:-]{0,64}$/;

type Json = string | number | boolean | null;

interface CaptureMessage {
  kind: "capture";
  uuid?: string;
  event?: string;
  distinct_id?: string;
  at?: string;
  props?: Record<string, unknown>;
  set?: Record<string, unknown>;
  set_once?: Record<string, unknown>;
}
interface DeleteMessage {
  kind: "delete_person";
  distinct_id?: string;
}
interface QueueRow {
  msg_id: number | string;
  read_ct: number;
  message: CaptureMessage | DeleteMessage | { kind?: string };
}

export interface PostHogEvent {
  event: string;
  uuid: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

/** Keeps only flat, safe properties; returns what was dropped so it can be logged (keys only). */
export function safeProps(input: Record<string, unknown> | undefined): { props: Record<string, Json>; dropped: string[] } {
  const props: Record<string, Json> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(input ?? {})) {
    const ok =
      KEY.test(key) &&
      (value === null ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && SAFE_STRING.test(value)));
    if (ok) props[key] = value as Json;
    else dropped.push(key);
  }
  return { props, dropped };
}

/** One outbox message as a PostHog batch event, or null if it isn't a valid capture. */
export function toPostHogEvent(message: CaptureMessage): { event: PostHogEvent; dropped: string[] } | null {
  if (!message.event || !EVENT.test(message.event)) return null;
  if (!message.distinct_id || !UUID.test(message.distinct_id)) return null;
  if (!message.uuid || !UUID.test(message.uuid)) return null;
  const at = message.at ? new Date(message.at) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  const props = safeProps(message.props);
  const set = safeProps(message.set);
  const setOnce = safeProps(message.set_once);
  const properties: Record<string, unknown> = {
    ...props.props,
    distinct_id: message.distinct_id,
    $lib: "skilient-outbox",
    // The server knows nothing about the visitor's browser or location; don't let PostHog guess from our IP.
    $geoip_disable: true,
  };
  if (message.set && Object.keys(set.props).length) properties.$set = set.props;
  if (message.set_once && Object.keys(setOnce.props).length) properties.$set_once = setOnce.props;
  return {
    event: { event: message.event, uuid: message.uuid, timestamp: at.toISOString(), properties },
    dropped: [...props.dropped, ...set.dropped.map((k) => `$set.${k}`), ...setOnce.dropped.map((k) => `$set_once.${k}`)],
  };
}

export interface AnalyticsRun {
  sent: number;
  muted: number;
  deleted: number;
  failed: number;
  dropped: number;
}

export async function runAnalyticsWorker(opts: {
  db: Db;
  cfg: AnalyticsConfig;
  fetch: Fetch;
  log: Log;
  batch?: number;
}): Promise<AnalyticsRun> {
  const { db, cfg, log } = opts;
  const out: AnalyticsRun = { sent: 0, muted: 0, deleted: 0, failed: 0, dropped: 0 };
  const rows = await db.query<QueueRow>("select msg_id, read_ct, message from pgmq.read('analytics', 120, $1::integer)", [
    opts.batch ?? 200,
  ]);
  if (rows.length === 0) return out;

  const [config] = await db.query<{ muted: unknown }>(
    "select coalesce(private.config('analytics.muted_events'), '[]'::jsonb) as muted",
  );
  const muted = new Set(Array.isArray(config?.muted) ? (config.muted as string[]) : []);

  const remove = async (ids: (number | string)[]) => {
    if (!ids.length) return;
    // One text parameter, so the ids arrive the same way whether or not postgres.js prepares the statement.
    await db.query("select pgmq.delete('analytics', string_to_array($1::text, ',')::bigint[])", [ids.map(String).join(",")]);
  };

  const captures: { row: QueueRow; event: PostHogEvent }[] = [];
  const mutedIds: (number | string)[] = [];
  const badIds: (number | string)[] = [];
  const deletions: { row: QueueRow; distinctId: string }[] = [];
  for (const row of rows) {
    const message = row.message ?? {};
    if (message.kind === "capture") {
      const converted = toPostHogEvent(message as CaptureMessage);
      if (!converted) {
        badIds.push(row.msg_id);
        continue;
      }
      if (converted.dropped.length) log("analytics.worker", { level: "warn", outcome: "dropped_props", event: converted.event.event, keys: converted.dropped });
      if (muted.has(converted.event.event)) mutedIds.push(row.msg_id);
      else captures.push({ row, event: converted.event });
    } else if (message.kind === "delete_person" && UUID.test((message as DeleteMessage).distinct_id ?? "")) {
      deletions.push({ row, distinctId: (message as DeleteMessage).distinct_id! });
    } else {
      badIds.push(row.msg_id);
    }
  }
  if (badIds.length) {
    await remove(badIds);
    out.dropped += badIds.length;
    log("analytics.worker", { level: "warn", outcome: "refused", reason: "bad_message", count: badIds.length });
  }
  if (mutedIds.length) {
    await remove(mutedIds);
    out.muted += mutedIds.length;
  }

  if (captures.length) {
    let ok = false;
    let status = 0;
    try {
      const res = await opts.fetch(`${cfg.host}/batch/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: cfg.projectKey, batch: captures.map((c) => c.event) }),
      });
      status = res.status;
      ok = res.ok;
      await res.body?.cancel();
    } catch {
      ok = false;
    }
    if (ok) {
      await remove(captures.map((c) => c.row.msg_id));
      out.sent += captures.length;
      log("analytics.worker", { outcome: "ok", sent: captures.length });
    } else {
      const giveUp = captures.filter((c) => c.row.read_ct >= MAX_TRIES).map((c) => c.row.msg_id);
      await remove(giveUp);
      out.dropped += giveUp.length;
      out.failed += captures.length - giveUp.length;
      log("analytics.worker", { level: "error", outcome: "error", status, count: captures.length, dropped: giveUp.length });
    }
  }

  for (const { row, distinctId } of deletions) {
    if (!cfg.apiHost || !cfg.projectId || !cfg.personalKey) {
      await db.query("select pgmq.set_vt('analytics', $1::bigint, $2::integer)", [String(row.msg_id), DELETE_RETRY_S]);
      out.failed++;
      log("analytics.delete", { level: "error", outcome: "not_configured" });
      continue;
    }
    const result = await deletePerson(opts.fetch, cfg, distinctId);
    if (result === "deleted" || result === "no_person") {
      await remove([row.msg_id]);
      out.deleted++;
      log("analytics.delete", { outcome: result, user_id: distinctId });
    } else {
      await db.query("select pgmq.set_vt('analytics', $1::bigint, $2::integer)", [String(row.msg_id), DELETE_RETRY_S]);
      out.failed++;
      log("analytics.delete", { level: "error", outcome: "error", status: result, user_id: distinctId, tries: row.read_ct });
    }
  }
  return out;
}

/**
 * PostHog persons bulk delete by distinct id (scope `person:write`), with the person's events and
 * recordings. A distinct id PostHog never saw is a no-op; PostHog refuses `delete_events` for it,
 * so that answer counts as done.
 */
async function deletePerson(fetchImpl: Fetch, cfg: AnalyticsConfig, distinctId: string): Promise<"deleted" | "no_person" | number> {
  try {
    const res = await fetchImpl(`${cfg.apiHost}/api/projects/${cfg.projectId}/persons/bulk_delete/`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.personalKey}` },
      body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true, delete_recordings: true }),
    });
    const text = await res.text();
    if (res.ok) {
      const body = safeJson(text);
      const notFound = Array.isArray(body?.distinct_ids_not_found) && body.distinct_ids_not_found.includes(distinctId);
      return notFound ? "no_person" : "deleted";
    }
    if (res.status === 400 && /not.?found|no person|matched no/i.test(text)) return "no_person";
    return res.status;
  } catch {
    return 0;
  }
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
