"use client";

import { useEffect } from "react";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { identify } from "@/lib/analytics/client";

/**
 * Ties this browser's PostHog identity to the signed-in account (PRD 10 "Identity"): the internal
 * uuid, the role and the university id. Never a name, email or username.
 */
export function AnalyticsIdentity() {
  const user = useCurrentUser();
  useEffect(() => {
    if (user) identify(user.id, { role: user.role, university_id: user.universityId });
  }, [user]);
  return null;
}
