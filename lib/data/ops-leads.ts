import "server-only";

import { rpcJson } from "@/lib/data/rpc-json";

/** University requests per domain for /ops/leads (PRD 5.1); accounts staff, checked in SQL. */
export interface UniversityRequestRow {
  domain: string;
  university_id: string | null;
  university: string | null;
  live: boolean;
  requests: number;
  confirmed: number;
  notified: number;
  latest: string;
}

export const getUniversityRequests = () => rpcJson<UniversityRequestRow[]>("ops_university_requests", {});
