import "server-only";

/**
 * The public half of the Skilient GitHub App (PRD 5.5), for building links. The secret
 * half (private key, client secret) lives only in the Edge Functions' secrets.
 */
export interface GithubApp {
  slug: string;
  clientId: string;
}

export const GITHUB_WEB = "https://github.com";

export function githubApp(): GithubApp | null {
  const slug = process.env.GITHUB_APP_SLUG;
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  if (!slug || !clientId || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) return null;
  return { slug, clientId };
}

/** First connection: install the App and choose repositories (GitHub then asks to authorise). */
export function installUrl(app: GithubApp, state: string): string {
  return `${GITHUB_WEB}/apps/${app.slug}/installations/new?state=${encodeURIComponent(state)}`;
}

/** Already installed: just authorise, which returns a code to the callback. */
export function authorizeUrl(app: GithubApp, state: string): string {
  return `${GITHUB_WEB}/login/oauth/authorize?client_id=${encodeURIComponent(app.clientId)}&state=${encodeURIComponent(state)}`;
}
