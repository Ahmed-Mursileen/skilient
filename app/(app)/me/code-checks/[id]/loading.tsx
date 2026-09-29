import { LoadingState, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-[var(--page-gutter)] py-8">
      <Skeleton className="h-10 w-1/2" />
      <LoadingState label="Loading your code check" lines={6} />
    </main>
  );
}
