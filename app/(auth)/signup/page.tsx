import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { getCurrentAgreement, type Agreement } from "@/lib/data/agreement";
import { logger } from "@/lib/log";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Join Skilient with your university email.",
};

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const faculty = sp.role === "faculty";
  const official = sp.role === "university_admin";
  // The checkbox still works if the text can't load; the server records the current version.
  const agreement: Agreement | null = await getCurrentAgreement().catch((err: unknown) => {
    logger.error("signup.agreement_unavailable", { action: "GET /signup", outcome: "error", error_code: String(err).slice(0, 80) });
    return null;
  });
  return (
    <AuthFrame
      title="Join Skilient"
      description={official ? "University officials: sign up with your official email, then claim your university's portal." : faculty ? "Faculty: sign up with your university email, then ask for the teacher role." : "Sign up with your university email. We'll send a code to confirm it."}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/signin" className="font-semibold text-text-primary underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm siteKey={turnstileSiteKey()} agreement={agreement} role={official ? "university_admin" : faculty ? "faculty" : "student"} />
    </AuthFrame>
  );
}
