import { appJwt } from "./jwt.ts";
import type { Fetch, GithubConfig } from "./types.ts";

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/** Retry after `seconds`: a secondary limit, or the token's budget is nearly spent. */
export class RateLimited extends Error {
  constructor(readonly seconds: number) {
    super(`rate limited for ${seconds}s`);
    this.name = "RateLimited";
  }
}

/** PRD 5.5: below 200 remaining requests, jobs wait for the reset. */
export const LOW_BUDGET = 200;

interface Budget {
  remaining: number;
  resetAt: number; // epoch seconds
}

/**
 * Thin REST client. It remembers each token's rate-limit budget, so a stage can call
 * `ensureBudget(token)` before starting work and defer instead of burning the last calls.
 */
export class GitHub {
  private budgets = new Map<string, Budget>();
  private installationTokens = new Map<number, { token: string; expiresAt: number }>();

  constructor(
    readonly cfg: GithubConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  ensureBudget(token: string): void {
    const budget = this.budgets.get(token);
    const nowSeconds = Math.floor(this.now() / 1000);
    if (budget && budget.remaining < LOW_BUDGET && budget.resetAt > nowSeconds) {
      throw new RateLimited(budget.resetAt - nowSeconds + 1);
    }
  }

  async request<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ data: T; link: string | null }> {
    const method = init.method ?? "GET";
    const url = path.startsWith("http") ? path : `${this.cfg.apiUrl}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Skilient",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    this.track(token, res.headers);
    if (res.status === 403 || res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      if (retryAfter > 0) throw new RateLimited(retryAfter);
      if (res.headers.get("x-ratelimit-remaining") === "0") {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        throw new RateLimited(Math.max(1, reset - Math.floor(this.now() / 1000) + 1));
      }
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new GitHubError(res.status, `${method} ${path.split("?")[0]} returned ${res.status}`);
    }
    const data = res.status === 204 ? (null as T) : ((await res.json()) as T);
    return { data, link: res.headers.get("link") };
  }

  /** Follows `Link: rel="next"` up to `maxPages`, collecting `pick(page)`. */
  async paginate<P, T>(token: string, path: string, pick: (page: P) => T[], maxPages = 20): Promise<T[]> {
    const items: T[] = [];
    let next: string | null = path;
    for (let page = 0; next && page < maxPages; page++) {
      const res: { data: P; link: string | null } = await this.request<P>(token, next);
      const { data, link } = res;
      items.push(...pick(data));
      next = link ? (/<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null) : null;
    }
    return items;
  }

  /** Installation access token (1 hour), cached for the life of this client. */
  async installationToken(installationId: number): Promise<string> {
    const cached = this.installationTokens.get(installationId);
    if (cached && cached.expiresAt - this.now() > 5 * 60_000) return cached.token;
    const jwt = await appJwt(this.cfg.appId, this.cfg.privateKey, Math.floor(this.now() / 1000));
    const { data } = await this.request<{ token: string; expires_at: string }>(
      jwt,
      `/app/installations/${installationId}/access_tokens`,
      { method: "POST" },
    );
    this.installationTokens.set(installationId, { token: data.token, expiresAt: Date.parse(data.expires_at) });
    return data.token;
  }

  private track(token: string, headers: Headers) {
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    if (remaining !== null && reset !== null) {
      this.budgets.set(token, { remaining: Number(remaining), resetAt: Number(reset) });
    }
  }
}

// --- User-to-server OAuth (the student's token) --------------------------------------

export interface UserTokens {
  accessToken: string;
  accessExpiresAt: string | null;
  refreshToken: string | null;
  refreshExpiresAt: string | null;
}

async function oauthToken(cfg: GithubConfig, fetchImpl: Fetch, params: Record<string, string>, now: number): Promise<UserTokens> {
  const res = await fetchImpl(`${cfg.webUrl}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Skilient" },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new GitHubError(res.status, `oauth ${params.grant_type ?? "code"} failed: ${body.error ?? res.status}`);
  }
  const at = (seconds?: number) => (seconds ? new Date(now + seconds * 1000).toISOString() : null);
  return {
    accessToken: body.access_token,
    accessExpiresAt: at(body.expires_in),
    refreshToken: body.refresh_token ?? null,
    refreshExpiresAt: at(body.refresh_token_expires_in),
  };
}

export function exchangeCode(cfg: GithubConfig, fetchImpl: Fetch, code: string, now = Date.now()) {
  return oauthToken(cfg, fetchImpl, { code }, now);
}

export function refreshUserToken(cfg: GithubConfig, fetchImpl: Fetch, refreshToken: string, now = Date.now()) {
  return oauthToken(cfg, fetchImpl, { grant_type: "refresh_token", refresh_token: refreshToken }, now);
}

/**
 * Deletes the student's authorisation of the App, which revokes every token it issued.
 * Returns false when GitHub no longer knows the token (already revoked or expired).
 */
export async function revokeGrant(cfg: GithubConfig, fetchImpl: Fetch, accessToken: string): Promise<boolean> {
  const res = await fetchImpl(`${cfg.apiUrl}/applications/${cfg.clientId}/grant`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`,
      "Content-Type": "application/json",
      "User-Agent": "Skilient",
    },
    body: JSON.stringify({ access_token: accessToken }),
  });
  await res.body?.cancel();
  if (res.status === 204) return true;
  if (res.status === 404 || res.status === 422) return false;
  throw new GitHubError(res.status, `revoke grant returned ${res.status}`);
}
