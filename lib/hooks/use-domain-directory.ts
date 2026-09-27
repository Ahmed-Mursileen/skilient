"use client";

import { useEffect, useState } from "react";
import type { DomainDirectory } from "@/lib/auth/email-domain";

let cached: Promise<DomainDirectory | null> | null = null;

/**
 * The public university domain list (/api/universities/domains, CDN-cached). Null while
 * loading or if it fails; forms then skip instant detection and rely on the server.
 */
export function useDomainDirectory(): DomainDirectory | null {
  const [directory, setDirectory] = useState<DomainDirectory | null>(null);
  useEffect(() => {
    let alive = true;
    cached ??= fetch("/api/universities/domains")
      .then((res) => (res.ok ? (res.json() as Promise<DomainDirectory>) : null))
      .catch(() => {
        cached = null;
        return null;
      });
    cached.then((d) => {
      if (alive) setDirectory(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  return directory;
}
