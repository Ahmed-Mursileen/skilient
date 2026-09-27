import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui";
import { ConfirmedBroadcast } from "./confirmed-broadcast";

export const metadata: Metadata = { title: "Email confirmed", robots: { index: false } };

export default async function ConfirmedPage({ searchParams }: PageProps<"/auth/confirmed">) {
  const params = await searchParams;
  if (params.error) {
    return (
      <AuthFrame
        title="This link has expired"
        description="Confirmation links work once, for 15 minutes. If you already confirmed, just sign in. Otherwise sign in to get a new code."
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/signin">Sign in</Link>
        </Button>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="You're confirmed" description="You can close this tab. The tab where you signed up moves on by itself.">
      <ConfirmedBroadcast />
      <Button asChild variant="secondary" size="lg" className="w-full">
        <Link href="/feed">Continue here instead</Link>
      </Button>
    </AuthFrame>
  );
}
