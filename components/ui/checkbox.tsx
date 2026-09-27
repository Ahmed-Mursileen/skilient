"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "@phosphor-icons/react/dist/ssr";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export const Checkbox = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <CheckboxPrimitive.Root
        ref={ref}
        className={cn(
          "peer inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-bg-surface",
          "transition-colors duration-[120ms] ease-standard hover:border-text-muted",
          "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-text-on-primary",
          "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-text-on-primary",
          "disabled:cursor-not-allowed disabled:border-border-default disabled:bg-bg-muted disabled:text-text-disabled",
          "aria-[invalid=true]:border-error",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="group">
          <Check aria-hidden weight="bold" className="size-3.5 group-data-[state=indeterminate]:hidden" />
          <Minus aria-hidden weight="bold" className="hidden size-3.5 group-data-[state=indeterminate]:block" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  },
);
