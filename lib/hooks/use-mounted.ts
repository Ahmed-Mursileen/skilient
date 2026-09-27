"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True only after hydration; guard theme-dependent renders with it (PRD 9.5). */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
