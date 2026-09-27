"use client";

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  // Loaded by our own (nonce-trusted) bundle, so CSP 'strict-dynamic' allows it.
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile_load_failed"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile (PRD 10): usually invisible ("interaction-only"). Calls onToken with
 * a fresh token, or null when it expires or fails. Change `resetKey` to get a new token
 * after a submit (tokens are single-use).
 */
export function Turnstile({
  siteKey,
  onToken,
  resetKey = 0,
  action,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  resetKey?: number;
  action?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          theme: "auto",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) {
      callback.current(null);
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey]);

  return <div ref={container} className="min-h-0 empty:hidden" data-testid="turnstile" />;
}
