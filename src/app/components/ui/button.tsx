import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const primaryButtonClasses =
  "rounded-[var(--omvra-radius-control)] bg-[var(--omvra-color-action-primary)] text-[var(--omvra-color-text-inverse)] shadow-[var(--omvra-button-primary-shadow)] hover:bg-[var(--omvra-color-action-primary-hover)] active:bg-[var(--omvra-color-action-primary-pressed)] active:shadow-[var(--omvra-button-primary-pressed-shadow)] focus-visible:bg-[var(--omvra-color-action-primary-pressed)] focus-visible:shadow-[var(--omvra-button-primary-focus-shadow)] disabled:bg-[var(--omvra-color-action-disabled)] disabled:text-[var(--omvra-color-text-disabled)] disabled:shadow-none";

const secondaryButtonClasses =
  "rounded-[var(--omvra-radius-pill)] bg-[var(--omvra-color-surface-default)] text-[var(--omvra-color-text-secondary)] shadow-[var(--omvra-button-shadow)] hover:shadow-[var(--omvra-button-hover-shadow)] active:shadow-[var(--omvra-button-hover-shadow)] focus-visible:shadow-[var(--omvra-button-focus-shadow)] disabled:bg-[var(--omvra-color-action-disabled)] disabled:text-[var(--omvra-color-text-disabled)] disabled:shadow-none";

const tertiaryButtonClasses =
  "justify-start rounded-[var(--omvra-radius-control)] border border-[var(--omvra-color-border-default)] bg-transparent text-[var(--omvra-color-text-secondary)] shadow-none hover:border-transparent hover:bg-[var(--omvra-color-focus-surface)] active:border-transparent active:bg-[var(--omvra-color-action-primary-pressed)]/[.15] focus-visible:border-transparent focus-visible:bg-[var(--omvra-color-surface-default)] focus-visible:shadow-[var(--omvra-button-focus-ring)] disabled:bg-transparent disabled:text-[var(--omvra-color-text-disabled)] disabled:shadow-none";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium leading-[normal] transition-[background-color,color,border-color,box-shadow,transform] duration-150 [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)] active:scale-[0.98] disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-none aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: primaryButtonClasses,
        primary: primaryButtonClasses,
        destructive:
          "rounded-[var(--omvra-radius-control)] border border-[var(--omvra-color-feedback-danger)] bg-[var(--omvra-color-feedback-danger-surface)] text-[var(--omvra-color-feedback-danger)] shadow-none hover:bg-[var(--omvra-color-feedback-danger-surface)] focus-visible:shadow-[var(--omvra-focus-ring)] disabled:bg-[var(--omvra-color-action-disabled)] disabled:text-[var(--omvra-color-text-disabled)]",
        outline: tertiaryButtonClasses,
        secondary: secondaryButtonClasses,
        tertiary: tertiaryButtonClasses,
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link:
          "!h-6 !rounded-[4px] !px-1.5 !py-1 !text-xs text-[var(--omvra-color-action-primary)] shadow-none hover:bg-[var(--omvra-color-focus-surface)] active:bg-[var(--omvra-color-action-primary-pressed)]/[.15] active:text-[var(--omvra-color-action-primary-pressed)] focus-visible:bg-[var(--omvra-color-surface-default)] focus-visible:shadow-[var(--omvra-button-focus-ring)] disabled:bg-transparent disabled:text-[var(--omvra-color-text-disabled)] disabled:shadow-none",
      },
      size: {
        default: "h-9 px-3 py-1.5 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9 justify-center rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
