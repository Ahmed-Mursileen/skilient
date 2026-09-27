import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/auth-frame";
import { safeNext } from "@/lib/auth/gate";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Two-factor code", robots: { index: false } };

export default async function SigninMfaPage({ searchParams }: PageProps<"/signin/mfa">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  return (
    <AuthFrame title="Enter your code" description="Open your authenticator app and enter the 6-digit code for Skilient.">
      <MfaForm next={next} />
    </AuthFrame>
  );
}
