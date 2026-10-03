import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/cv/site";

/** Crawlers see the public site only (PRD 5.1). Signed-in pages also carry noindex in their layout. */
const PRIVATE = [
  "/agreement", "/api/", "/appeals", "/auth/", "/billing", "/chat", "/companies", "/competitions", "/cv/", "/events", "/explore",
  "/fairs", "/feed", "/feedback", "/friends", "/ideas", "/join", "/leaderboard", "/me", "/moderation", "/notifications",
  "/onboarding", "/opportunities", "/ops", "/org", "/post", "/profile", "/recruit", "/requests", "/settings", "/teach",
  "/u/", "/uni", "/ventures", "/verify/", "/request-university/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
