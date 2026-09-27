import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  return (
    <AuthFrame
      title="Reset your password"
      description="Enter your university email and we'll send you a link to choose a new password."
      footer={
        <Link href="/signin" className="font-semibold text-text-primary underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <ForgotForm expired={params.error === "expired"} />
    </AuthFrame>
  );
}
