"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { attachAnalytics, enableAnalytics, followRoute, track } from "@/lib/analytics/client";
import { isRecordingBlocked, REPLAY_PRIVACY, REPLAY_SAMPLE_RATE, scrubEvent, scrubPath } from "@/lib/analytics/privacy";

/** Wait this long at most for an idle moment before loading PostHog. */
const IDLE_TIMEOUT_MS = 4000;
const CTA = /^[a-z0-9_]{1,40}$/;

/**
 * PostHog in the browser (PRD 10; phase 13 slice 1). posthog-js (about 100 KB) loads once the page is
 * idle, so it never competes with the first paint, and talks to /ingest on our own domain (rewritten
 * to PostHog EU in next.config.ts), so the CSP stays 'self'. Autocapture is off: only page views,
 * the named landing events and, on the PRD's pages, heatmaps. Replays are sampled at 20%, with all
 * text and inputs masked and user images blocked, and never on the routes in lib/analytics/privacy.
 * Without a project key (local, CI) nothing loads.
 */
export function AnalyticsLoader({ projectKey, nonce }: { projectKey: string | null; nonce?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!projectKey) return;
    enableAnalytics();
    let cancelled = false;

    const load = () => {
      void import("posthog-js").then(({ default: posthog }) => {
        if (cancelled) return;
        const pausedAtStart = isRecordingBlocked(window.location.pathname);
        posthog.init(projectKey, {
          api_host: "/ingest",
          ui_host: "https://eu.posthog.com",
          // No analytics cookie (question 4); cleared on sign-out (lib/auth/channel.ts).
          persistence: "localStorage",
          person_profiles: "identified_only",
          autocapture: false,
          capture_pageview: "history_change",
          capture_pageleave: false,
          capture_dead_clicks: false,
          rageclick: false,
          capture_exceptions: false,
          capture_performance: false,
          capture_heatmaps: true,
          mask_all_text: true,
          mask_all_element_attributes: true,
          mask_personal_data_properties: true,
          disable_surveys: true,
          disable_product_tours: true,
          disable_conversations: true,
          disable_web_experiments: true,
          advanced_disable_feature_flags: true,
          disable_session_recording: pausedAtStart,
          session_recording: { ...REPLAY_PRIVACY, sampleRate: REPLAY_SAMPLE_RATE },
          before_send: (event) => scrubEvent(event, window.location.pathname),
          // The recorder and remote config load as scripts; give them this page's CSP nonce.
          prepare_external_dependency_script: (script) => {
            if (nonce) script.nonce = nonce;
            return script;
          },
          loaded: () => attachAnalytics(posthog, { recordingPaused: pausedAtStart }),
        });
      });
    };

    // Safari has no requestIdleCallback.
    let cancelLoad: () => void;
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS });
      cancelLoad = () => window.cancelIdleCallback(handle);
    } else {
      const handle = setTimeout(load, 1500);
      cancelLoad = () => clearTimeout(handle);
    }

    // Calls to action marked `data-track="org_cta_click"` (server components can't hold handlers).
    const onClick = (event: MouseEvent) => {
      const el = (event.target as Element | null)?.closest?.<HTMLElement>("[data-track]");
      if (!el || el.dataset.track !== "org_cta_click") return;
      const cta = el.dataset.trackCta ?? "";
      if (CTA.test(cta)) track("org_cta_click", { cta, page: scrubPath(window.location.pathname) });
    };
    document.addEventListener("click", onClick, true);

    return () => {
      cancelled = true;
      cancelLoad();
      document.removeEventListener("click", onClick, true);
    };
  }, [projectKey, nonce]);

  useEffect(() => {
    if (projectKey) followRoute(pathname);
  }, [projectKey, pathname]);

  return null;
}
