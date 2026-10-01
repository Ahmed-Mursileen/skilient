import { apiCall } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

/** GET /api/v1/shortlists: your organisation's shortlists. */
export async function GET(request: Request) {
  return apiCall(request, "GET /api/v1/shortlists", "api_shortlists", (token) => ({ p_token: token }));
}
