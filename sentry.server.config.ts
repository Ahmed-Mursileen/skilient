import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentry-scrub";

Sentry.init({ dsn: process.env.SENTRY_DSN, ...sentryBaseOptions });
