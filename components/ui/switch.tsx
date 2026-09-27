"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export const Switch = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(
  function Switch({ className, ...props }, ref) {
    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={cn(
          "inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border-strong bg-bg-muted p-0.5",
          "transition-colors duration-[200ms] ease-standard",
          "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "block size-4.5 rounded-full bg-text-secondary shadow-1 transition-transform duration-[200ms] ease-standard",
            "data-[state=checked]:translate-x-4 data-[state=checked]:bg-text-on-primary",
          )}
        />
      </SwitchPrimitive.Root>
    );
  },
);
