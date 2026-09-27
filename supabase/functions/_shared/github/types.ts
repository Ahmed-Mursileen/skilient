/**
 * Shared by the github-link and github-worker Edge Functions (Deno) and their tests
 * (Node): plain TypeScript with web APIs only, relative `.ts` imports, no Deno globals.
 */

/** Minimal database handle: postgres.js `sql.unsafe` in both runtimes. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** postgres.js `Sql` (or anything with the same `unsafe`). */
export interface UnsafeSql {
  unsafe(text: string, params?: never[]): PromiseLike<unknown>;
}

export function dbFrom(sql: UnsafeSql): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.unsafe(text, params as never[])) as T[];
    },
  };
}

export interface GithubConfig {
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  /** https://api.github.com (overridden in tests) */
  apiUrl: string;
  /** https://github.com (overridden in tests) */
  webUrl: string;
}

export type Env = (name: string) => string | undefined;

export function configFromEnv(env: Env): GithubConfig {
  const required = (name: string) => {
    const value = env(name);
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  return {
    appId: required("GITHUB_APP_ID"),
    clientId: required("GITHUB_APP_CLIENT_ID"),
    clientSecret: required("GITHUB_APP_CLIENT_SECRET"),
    // Secrets set from a shell often carry literal "\n" instead of newlines.
    privateKey: required("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
    apiUrl: (env("GITHUB_API_URL") ?? "https://api.github.com").replace(/\/$/, ""),
    webUrl: (env("GITHUB_WEB_URL") ?? "https://github.com").replace(/\/$/, ""),
  };
}

export type Fetch = typeof fetch;

export type Log = (event: string, fields?: Record<string, unknown>) => void;

/** JSON log line, the same shape as lib/log.ts in the app. */
export const jsonLog: Log = (event, fields = {}) => {
  console.log(JSON.stringify({ level: "info", msg: event, time: new Date().toISOString(), ...fields }));
};

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Constant-time string comparison for bearer secrets. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
