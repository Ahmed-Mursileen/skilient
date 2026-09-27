import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/auth-frame";
import { NotMeForm } from "./not-me-form";

export const metadata: Metadata = { title: "This wasn't me", robots: { index: false } };

/**
 * From the new-device email (PRD 10). Opening the link does nothing by itself (mail
 * scanners prefetch links); the button signs out every session and sends a reset link.
 */
export default async function NotMePage({ searchParams }: PageProps<"/auth/not-me">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <AuthFrame
      title="Secure your account"
      description="We'll sign your account out on every device, including this one, and email you a link to choose a new password."
    >
      <NotMeForm token={token} />
    </AuthFrame>
  );
}
