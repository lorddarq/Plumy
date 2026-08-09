import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-[var(--omvra-radius-control)] border border-[var(--omvra-color-border-default)] bg-[var(--omvra-color-surface-default)] px-3 py-1 text-sm font-medium text-[var(--omvra-color-text-secondary)] shadow-[var(--omvra-elevation-surface)] transition-[box-shadow,border-color] outline-none placeholder:text-[var(--omvra-color-text-muted)] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[var(--omvra-color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--omvra-color-focus-surface)]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
