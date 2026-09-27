"use client";

import type { ReactNode } from "react";
import { Dialog, DialogTrigger, SideSheetContent } from "@/components/ui";
import { AgreementText } from "./agreement-text";

/** "I agree to the Skilient User Agreement and Privacy Notice": the link opens this side sheet. */
export function AgreementSheet({
  version,
  title,
  body,
  children,
}: {
  version: number;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <SideSheetContent title={title} description={`Version ${version}`}>
        <AgreementText markdown={body} />
      </SideSheetContent>
    </Dialog>
  );
}
