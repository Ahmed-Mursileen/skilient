import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  // CV PDFs (PRD 5.18): Chromium ships as compressed files the package unpacks at run time.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: { "/api/cv/**": ["./node_modules/@sparticuz/chromium/bin/**"] },
  experimental: {
    // Profile images (PRD 5.4: covers up to 8 MB) are uploaded through a server action.
    serverActions: { bodySizeLimit: "9mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // Screen spec route note: old routes keep working. `edit` is a reserved username.
    // PRD 5.7: /projects and /startups merged into /ventures (type tabs).
    return [
      { source: "/profile/edit", destination: "/settings/profile", permanent: true },
      { source: "/projects", destination: "/ventures", permanent: true },
      { source: "/projects/new", destination: "/ventures/new", permanent: true },
      { source: "/projects/:path*", destination: "/ventures/:path*", permanent: true },
      { source: "/startups", destination: "/ventures?type=startup", permanent: true },
      { source: "/startups/new", destination: "/ventures/new?type=startup", permanent: true },
      { source: "/startups/:path*", destination: "/ventures/:path*", permanent: true },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Upload source maps only when a token is configured (Vercel builds); never ship them publicly.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
  telemetry: false,
});
