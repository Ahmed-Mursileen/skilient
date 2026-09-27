import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { safeNext } from "@/lib/auth/gate";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { SigninForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  google_domain: "Use your university Google account.",
  google: "Google sign-in didn't finish. Try again, or use your email and password.",
  domain: "Your email's domain is no longer on Skilient's university list. Contact support to move your account.",
  link_expired: "That link has expired or was already used. Sign in, or ask for a new one.",
};

export default async function SigninPage({ searchParams }: PageProps<"/signin">) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : null;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  return (
    <AuthFrame
      title="Welcome back"
      footer={
        <>
          New to Skilient?{" "}
          <Link href="/signup" className="font-semibold text-text-primary underline underline-offset-4">
            Sign up with your university email
          </Link>
        </>
      }
    >
      <SigninForm siteKey={turnstileSiteKey()} next={next} initialError={errorKey ? (ERRORS[errorKey] ?? null) : null} />
    </AuthFrame>
  );
}
