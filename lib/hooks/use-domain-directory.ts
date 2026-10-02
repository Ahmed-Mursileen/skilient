"use client";

import { useEffect, useState } from "react";
import type { DomainDirectory } from "@/lib/auth/email-domain";

let cached: Promise<DomainDirectory | null> | null = null;

/**
 * Fetches the public university domain list once per page (/api/universities/domains,
 * CDN-cached): detection then runs locally, with no request per keystroke (PRD 5.1).
 * Resolves null if it fails; forms then rely on the server's check.
 */
export function fetchDomainDirectory(): Promise<DomainDirectory | null> {
  cached ??= fetch("/api/universities/domains")
    .then((res) => (res.ok ? (res.json() as Promise<DomainDirectory>) : null))
    .catch(() => {
      cached = null;
      return null;
    });
  return cached;
}

/** The directory, loaded on mount. Null while loading or if it fails. */
export function useDomainDirectory(): DomainDirectory | null {
  const [directory, setDirectory] = useState<DomainDirectory | null>(null);
  useEffect(() => {
    let alive = true;
    fetchDomainDirectory().then((d) => {
      if (alive) setDirectory(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  return directory;
}
