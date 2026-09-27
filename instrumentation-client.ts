import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentry-scrub";

Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ...sentryBaseOptions });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
