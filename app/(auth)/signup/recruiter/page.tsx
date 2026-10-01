import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { getCurrentAgreement, type Agreement } from "@/lib/data/agreement";
import { getInvitePreview } from "@/lib/data/recruit-public";
import { logger } from "@/lib/log";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { RecruiterSignupForm } from "./recruiter-signup-form";

export const metadata: Metadata = {
  title: "Recruiter sign up",
  description: "Create a Skilient recruiter account with your work email.",
};

/** /signup/recruiter (PRD 5.20): company email only; the organisation is set up next at /org/join. */
export default async function RecruiterSignupPage({ searchParams }: PageProps<"/signup/recruiter">) {
  const sp = await searchParams;
  const token = typeof sp.invite === "string" ? sp.invite : null;
  const invite = token ? await getInvitePreview(token) : null;
  const agreement: Agreement | null = await getCurrentAgreement().catch((err: unknown) => {
    logger.error("signup.agreement_unavailable", { action: "GET /signup/recruiter", outcome: "error", error_code: String(err).slice(0, 80) });
    return null;
  });
  return (
    <AuthFrame
      title={invite ? `Join ${invite.orgName} on Skilient` : "Hire on verified evidence"}
      description={
        invite
          ? `You're invited as ${invite.role}. Sign up with ${invite.email}.`
          : "Recruiter accounts use a work email. Next you'll set up two-factor sign-in and your company, and Skilient verifies it within two working days."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href="/signin" className="font-semibold text-text-primary underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <RecruiterSignupForm siteKey={turnstileSiteKey()} agreement={agreement} defaultEmail={invite?.email ?? ""} />
    </AuthFrame>
  );
}
