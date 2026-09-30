import { LoadingState, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <main className="mx-auto grid w-full max-w-[1200px] gap-8 px-[var(--page-gutter)] py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="aspect-[210/297] w-full" />
      </div>
      <LoadingState label="Preparing your CV" lines={8} />
    </main>
  );
}
