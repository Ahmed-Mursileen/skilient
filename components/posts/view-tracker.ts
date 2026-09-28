"use client";

import { useEffect, useState, type RefObject } from "react";
import { recordViews } from "@/lib/actions/posts";

/**
 * Qualified views (PRD 5.28): a post counts as seen once at least 60% of it has been on
 * screen for 1.5 s. Views are sent in batches every 10 s (and when the tab is hidden);
 * answering a survey sends that post's view first, since the server requires it.
 */
const QUALIFY_MS = 1500;
const FLUSH_MS = 10_000;

const pending = new Set<string>();
const sent = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

async function flush(ids?: string[]): Promise<void> {
  const batch = (ids ?? [...pending]).filter((id) => !sent.has(id)).slice(0, 100);
  if (!batch.length) return;
  batch.forEach((id) => {
    pending.delete(id);
    sent.add(id);
  });
  const result = await recordViews(batch).catch(() => null);
  if (!result?.ok) batch.forEach((id) => sent.delete(id)); // retry with the next batch
}

function schedule() {
  if (!listening && typeof document !== "undefined") {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
    });
  }
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, FLUSH_MS);
  }
}

/** Makes sure this post's view reached the server (before an answer). */
export async function ensureViewRecorded(id: string): Promise<void> {
  if (!sent.has(id)) await flush([id]);
}

/**
 * Watches an element; returns when it first came on screen (ms timestamp, for the answer
 * latency) and whether it has qualified as a view.
 */
export function useQualifiedView(ref: RefObject<HTMLElement | null>, id: string, track: boolean) {
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [qualified, setQualified] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track || typeof IntersectionObserver === "undefined") return;
    let hold: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.intersectionRatio >= 0.6 || (e.isIntersecting && e.intersectionRect.height >= window.innerHeight * 0.6));
        if (visible) {
          setShownAt((t) => t ?? performance.now());
          if (!hold) {
            hold = setTimeout(() => {
              setQualified(true);
              if (!sent.has(id)) {
                pending.add(id);
                schedule();
              }
            }, QUALIFY_MS);
          }
        } else if (hold) {
          clearTimeout(hold);
          hold = null;
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (hold) clearTimeout(hold);
    };
  }, [ref, id, track]);
  return { shownAt, qualified };
}
