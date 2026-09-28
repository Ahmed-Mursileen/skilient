import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui";
import { pendingVerification } from "@/lib/auth/cookies";
import { maskEmail } from "@/lib/auth/mask-email";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default async function VerifyEmailPage() {
  const email = await pendingVerification();
  if (!email) {
    return (
      <AuthFrame title="Nothing to confirm here" description="This page only works right after you sign up, in the same browser.">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="flex-1">
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="flex-1">
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame
      title="Check your inbox"
      description={
        <>
          We sent a 6-digit code to <strong className="font-semibold text-text-primary">{maskEmail(email)}</strong>. Enter it
          here, or open the link in the email. The code works for 15 minutes.
        </>
      }
      footer={
        <>
          Wrong address?{" "}
          <Link href="/signup" className="font-semibold text-text-primary underline underline-offset-4">
            Sign up again
          </Link>
        </>
      }
    >
      <VerifyForm />
    </AuthFrame>
  );
}
