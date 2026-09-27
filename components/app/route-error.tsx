"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

/** Route-level error boundary body: icon + text, a retry, and the ref so a report maps to a log line. */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="mx-auto w-full max-w-[680px] px-[var(--page-gutter)] py-10">
      <ErrorState
        title="This page didn't load"
        description="Something went wrong on our side. Try again; if it keeps happening, send us the ref below."
        requestId={error.digest}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </main>
  );
}
