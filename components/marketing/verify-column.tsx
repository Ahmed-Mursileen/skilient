import type { ReactNode } from "react";

/** /verify inside the marketing frame: the narrow column PublicFrame gives share links, without its own header. */
export function VerifyColumn({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-[var(--page-gutter)] pt-10 pb-20 sm:pt-14">{children}</div>;
}
