"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react/dist/ssr";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay() {
  return (
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgb(14_13_11/0.5)]" />
  );
}

function CloseButton() {
  return (
    <DialogPrimitive.Close
      aria-label="Close"
      className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text-primary"
    >
      <X aria-hidden className="size-4" weight="bold" />
    </DialogPrimitive.Close>
  );
}

interface ContentProps extends Omit<ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "title"> {
  title: ReactNode;
  description?: ReactNode;
}

export function DialogContent({ title, description, className, children, ...props }: ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
          "rounded-lg border border-border-default bg-bg-elevated p-6 shadow-4",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="pr-10 font-display text-h2 text-text-primary">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-2 text-body text-text-secondary">{description}</DialogPrimitive.Description>
        ) : null}
        <div className="mt-5">{children}</div>
        <CloseButton />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("mt-6 flex flex-wrap justify-end gap-3", className)} {...props} />;
}

/** Bottom sheet (radius xl) on phones; same Radix dialog behaviour. */
export function SheetContent({ title, description, className, children, ...props }: ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] w-full max-w-xl overflow-y-auto",
          "rounded-t-xl border border-b-0 border-border-default bg-bg-elevated p-6 shadow-4",
          className,
        )}
        {...props}
      >
        <div aria-hidden className="mx-auto -mt-2 mb-4 h-1 w-10 rounded-full bg-border-strong" />
        <DialogPrimitive.Title className="pr-10 text-h3 text-text-primary">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-2 text-body text-text-secondary">{description}</DialogPrimitive.Description>
        ) : null}
        <div className="mt-5">{children}</div>
        <CloseButton />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
