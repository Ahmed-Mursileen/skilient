import { REQUEST_ID_HEADER } from "./request-id";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type Outcome = "ok" | "error" | "refused";

/**
 * One JSON line per server action / job / route (PRD 10, Observability).
 * Only internal uuids: never names, emails, bodies or query strings.
 */
export interface LogFields {
  request_id?: string;
  /** Server action, route or job name, e.g. "posts.create" or "GET /api/health". */
  action?: string;
  user_id?: string;
  duration_ms?: number;
  outcome?: Outcome;
  error_code?: string;
  [key: string]: string | number | boolean | null | undefined;
}

type Sink = (line: string, level: LogLevel) => void;

const defaultSink: Sink = (line, level) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

let sink: Sink = defaultSink;

/** Test hook: capture log lines. Returns a restore function. */
export function setLogSink(next: Sink): () => void {
  const prev = sink;
  sink = next;
  return () => {
    sink = prev;
  };
}

export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const entry: Record<string, unknown> = { ts: new Date().toISOString(), level, msg };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) entry[k] = v;
  sink(JSON.stringify(entry), level);
}

export const logger = {
  debug: (msg: string, f?: LogFields) => log("debug", msg, f),
  info: (msg: string, f?: LogFields) => log("info", msg, f),
  warn: (msg: string, f?: LogFields) => log("warn", msg, f),
  error: (msg: string, f?: LogFields) => log("error", msg, f),
};

/** Reads the request id that proxy.ts put on the request. */
export function requestIdFrom(headers: Headers): string | undefined {
  return headers.get(REQUEST_ID_HEADER) ?? undefined;
}
