import { apiCall } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

/** GET /api/v1/jobs/{id}/applications: the applications to one of your jobs. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/jobs/[id]/applications">) {
  const { id } = await ctx.params;
  return apiCall(request, "GET /api/v1/jobs/[id]/applications", "api_job_applications", (token) => ({ p_token: token, p_job: id }), { id });
}
