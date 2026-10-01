import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { RecordEvent } from "./webhook";

/**
 * Stores a verified gateway event. A webhook acts for no user, so this uses the service role
 * (eslint allows it in lib/billing/**): `record_billing_event` is executable by service_role only.
 */
export const recordWithServiceRole: RecordEvent = async (gateway, e) => {
  const { data, error } = await createServiceClient().rpc("record_billing_event", {
    p_gateway: gateway,
    p_event_id: e.eventId,
    p_type: e.type,
    p_payload: e.payload as never,
    p_event: e.event as never,
    p_live: e.live,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return { duplicate: Boolean((data as { duplicate?: boolean } | null)?.duplicate) };
};
