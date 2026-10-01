import { apiCall } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

/** GET /api/v1/candidates/{id}: the student's signed CV (PRD 5.20), if your organisation has a link with them. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/candidates/[id]">) {
  const { id } = await ctx.params;
  return apiCall(request, "GET /api/v1/candidates/[id]", "api_candidate", (token) => ({ p_token: token, p_candidate: id }), { id });
}
