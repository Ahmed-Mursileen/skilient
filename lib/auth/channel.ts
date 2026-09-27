/**
 * Cross-tab auth messages. Supabase broadcasts its own client-side events; these cover
 * what happens server-side: an email link confirmed in another tab, or a sign-out.
 */
export const AUTH_CHANNEL = "skilient-auth";
export type AuthMessage = "confirmed" | "signed-out";

export function postAuthMessage(message: AuthMessage) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.postMessage(message);
  channel.close();
}

export function onAuthMessage(handler: (message: AuthMessage) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.onmessage = (event) => {
    if (event.data === "confirmed" || event.data === "signed-out") handler(event.data);
  };
  return () => channel.close();
}

/** Keys the app stores per user in the browser start with this prefix. */
export const LOCAL_KEY_PREFIX = "sk:";

/** Sign-out leaves nothing of the previous user in this browser (PRD 5.2: zero residue). */
export function clearClientState() {
  try {
    window.sessionStorage.clear();
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(LOCAL_KEY_PREFIX) || key.startsWith("sb-")) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable (private mode); nothing to clear then.
  }
}

/**
 * Full page load, not a client-side route change: after sign-out (or when another account
 * appears) every in-memory cache, React state and router cache must go (PRD 5.2).
 */
export function hardNavigate(path: string) {
  window.location.assign(path);
}
