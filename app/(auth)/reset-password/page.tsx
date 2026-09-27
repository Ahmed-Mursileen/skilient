import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthFrame title="This link has expired" description="Reset links work once, for 15 minutes. Ask for a new one.">
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame
      title="Choose a new password"
      description="At least 10 characters. Saving it signs you out on every other device."
    >
      <ResetForm />
    </AuthFrame>
  );
}
