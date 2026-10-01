import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * One SQL function, one jsonb document. The function checks who is asking (supabase/migrations/
 * 20261013..16_recruiter_*.sql); a refusal surfaces here as an Error carrying its SQLSTATE so pages
 * can answer with notFound() or a redirect.
 */
export class RpcError extends Error {
  constructor(
    readonly fn: string,
    readonly code: string | undefined,
    message: string,
  ) {
    super(`${fn}: ${code ?? "error"}`);
    this.name = "RpcError";
    this.detail = message;
  }
  detail: string;
}

export async function rpcJson<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new RpcError(fn, error.code, error.message);
  return data as T;
}

/** The refusal codes a page turns into "not found" (P0002) or "not yours" (42501). */
export function isRefusal(err: unknown, ...codes: string[]): boolean {
  return err instanceof RpcError && err.code !== undefined && codes.includes(err.code);
}
