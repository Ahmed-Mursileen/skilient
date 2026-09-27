import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { after } from "next/server";
import type { Database } from "@/types/database";
import type { ActionContext } from "@/lib/actions/context";
import { sendEmail } from "@/lib/email/send";
import { newDeviceEmail } from "@/lib/email/templates";
import { logger } from "@/lib/log";
import { sha256Hex } from "@/lib/security/hash";
import { approximateLocation, describeDevice } from "@/lib/security/request-meta";

/** Random per-browser id; only its hash reaches the database (user_devices). */
export const DEVICE_COOKIE = "sk_did";
const DEVICE_MAX_AGE = 400 * 24 * 60 * 60;

export type SignInMethod = "password" | "otp" | "magic_link" | "google" | "recovery";

type Meta = Pick<ActionContext, "requestId" | "ipHash" | "userAgent" | "origin" | "headers">;

async function deviceHash(): Promise<string> {
  const store = await cookies();
  let id = store.get(DEVICE_COOKIE)?.value;
  if (!id || !/^[0-9a-f]{64}$/.test(id)) {
    id = randomBytes(32).toString("hex");
    store.set(DEVICE_COOKIE, id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_MAX_AGE,
    });
  }
  return sha256Hex(id);
}

/**
 * After any successful sign-in: log the security event, remember the device, and when the
 * device is new for an account that signed in elsewhere before, email a new-device alert
 * with a one-time "This wasn't me" link (PRD 10). The email goes out after the response.
 */
export async function recordSignIn(
  supabase: SupabaseClient<Database>,
  meta: Meta,
  method: SignInMethod,
  email: string | null | undefined,
): Promise<void> {
  const { data, error } = await supabase.rpc("record_sign_in", {
    p_device_hash: await deviceHash(),
    p_ip_hash: meta.ipHash ?? "",
    p_user_agent: meta.userAgent,
    p_method: method,
  });
  if (error) {
    logger.error("auth.record_sign_in_failed", {
      request_id: meta.requestId,
      action: "auth.record_sign_in",
      outcome: "error",
      error_code: error.code ?? "unknown",
    });
    return;
  }
  const token = (data as { alert_token?: string | null } | null)?.alert_token;
  if (!token || !email) return;

  const details = {
    device: describeDevice(meta.userAgent),
    location: approximateLocation(meta.headers),
    at: new Date(),
    notMeUrl: `${meta.origin}/auth/not-me?token=${token}`,
  };
  after(() => sendEmail(newDeviceEmail(email, details), meta.requestId));
}
