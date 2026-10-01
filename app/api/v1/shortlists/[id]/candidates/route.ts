import { apiCall } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

/** GET /api/v1/shortlists/{id}/candidates: the visible candidates on one shortlist. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/shortlists/[id]/candidates">) {
  const { id } = await ctx.params;
  return apiCall(request, "GET /api/v1/shortlists/[id]/candidates", "api_shortlist_candidates", (token) => ({ p_token: token, p_list: id }), { id });
}
