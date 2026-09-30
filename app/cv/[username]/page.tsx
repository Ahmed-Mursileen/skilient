import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CvPaper } from "@/components/cv/cv-paper";
import { PublicFrame } from "@/components/cv/public-frame";
import { EmptyState } from "@/components/ui";
import { verifyUrl } from "@/lib/cv/document";
import { qrDataUri } from "@/lib/cv/qr";
import { siteUrl } from "@/lib/cv/site";
import { getSharedCv } from "@/lib/data/cv";

export const metadata: Metadata = { title: "Verified CV", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /cv/[username]?t= (PRD 5.18): a share link opens the student's newest version, signed-out.
 * A revoked newest version shows "no longer available", never an older one.
 */
export default async function SharedCvPage({ params, searchParams }: PageProps<"/cv/[username]">) {
  const { username } = await params;
  const t = (await searchParams).t;
  const token = typeof t === "string" ? t : "";
  const cv = await getSharedCv(token);
  if (cv.state === "ok" && cv.username && cv.username !== username) {
    redirect(`/cv/${cv.username}?t=${encodeURIComponent(token)}` as Route);
  }
  if (cv.state !== "ok") {
    return (
      <PublicFrame>
        <EmptyState
          title={cv.state === "unavailable" ? "This CV is no longer available" : "This link isn't valid"}
          description={
            cv.state === "unavailable"
              ? "The student withdrew this CV or made it private. Ask them for a new link."
              : "It may have expired or been revoked. Ask the student for a new link."
          }
          action={
            <Link href="/verify" className="text-body-sm font-semibold underline underline-offset-4">
              Check a CV by its code
            </Link>
          }
        />
      </PublicFrame>
    );
  }
  const site = siteUrl();
  return (
    <PublicFrame>
      <p className="text-body-sm text-text-secondary">
        A verified CV from Skilient: generated from checked evidence, not written by the student.{" "}
        <Link href={`/verify/${cv.code}` as Route} className="font-semibold text-text-primary underline underline-offset-4">
          Check its signature
        </Link>
      </p>
      <CvPaper snapshot={cv.snapshot} code={cv.code} issuedAt={cv.issuedAt} siteUrl={site} qrDataUri={await qrDataUri(verifyUrl(site, cv.code))} />
    </PublicFrame>
  );
}
