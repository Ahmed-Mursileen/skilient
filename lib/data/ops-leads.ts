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

/** "Talk to us" leads from /universities (PRD 5.1); accounts staff, checked in SQL. */
export interface SalesLeadRow {
  id: string;
  name: string;
  role: string;
  organisation: string;
  email: string;
  university_id: string | null;
  university: string | null;
  message: string;
  status: "new" | "contacted" | "won" | "lost";
  claimed_by: string | null;
  mine: boolean;
  staff_note: string | null;
  created_at: string;
}

export const getSalesLeads = () => rpcJson<SalesLeadRow[]>("ops_sales_leads", {});
