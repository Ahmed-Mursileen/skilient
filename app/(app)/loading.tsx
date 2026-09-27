import { LoadingState, Skeleton } from "@/components/ui";

/** Shown while a signed-in page loads on the server. */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <Skeleton className="h-10 w-1/2" />
      <LoadingState label="Loading" lines={4} />
    </main>
  );
}
