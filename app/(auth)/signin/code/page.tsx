import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { pendingSignInCode } from "@/lib/auth/cookies";
import { maskEmail } from "@/lib/auth/mask-email";
import { safeNext } from "@/lib/auth/gate";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { CodeRequestForm, CodeVerifyForm } from "./code-forms";

export const metadata: Metadata = { title: "Sign in with a code", robots: { index: false } };

/**
 * Sign in with a 6-digit code emailed to the student (decisions 2026-09-28). Always
 * available, even while password sign-in is slowed, so nobody can lock a student out.
 */
export default async function SigninCodePage({ searchParams }: PageProps<"/signin/code">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const email = await pendingSignInCode();
  const footer = (
    <Link
      href={(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin") as "/signin"}
      className="font-semibold text-text-primary underline underline-offset-4"
    >
      Sign in with your password instead
    </Link>
  );
  if (!email) {
    return (
      <AuthFrame
        title="Sign in with a code"
        description="Enter your university email. If it has a Skilient account, we'll email you a 6-digit code."
        footer={footer}
      >
        <CodeRequestForm siteKey={turnstileSiteKey()} next={next} />
      </AuthFrame>
    );
  }
  return (
    <AuthFrame
      title="Check your inbox"
      description={
        <>
          If <strong className="font-semibold text-text-primary">{maskEmail(email)}</strong> has a Skilient account, we
          sent it a 6-digit code. It works for 15 minutes, once.
        </>
      }
      footer={footer}
    >
      <CodeVerifyForm next={next} />
    </AuthFrame>
  );
}
