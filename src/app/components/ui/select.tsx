"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";

import { cn } from "./utils";

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "relative flex w-full items-center gap-2 rounded-[var(--omvra-radius-control)] border border-[var(--omvra-color-border-default)] bg-[var(--omvra-color-surface-default)] px-3 py-2 text-left text-sm whitespace-nowrap text-[var(--omvra-color-text-secondary)] transition-[color,box-shadow,border-color] outline-none focus-visible:border-[var(--omvra-color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--omvra-color-focus-surface)] aria-invalid:border-[var(--omvra-color-feedback-danger)] aria-invalid:ring-2 aria-invalid:ring-[var(--omvra-color-feedback-danger-surface)] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-[var(--omvra-color-text-muted)] data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:flex *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 *:data-[slot=select-value]:overflow-hidden *:data-[slot=select-value]:truncate [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
        "pr-8",
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="pointer-events-none absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center">
        <svg
          aria-hidden="true"
          className="size-4 text-[var(--omvra-color-text-muted)]"
          fill="none"
          viewBox="0 0 16 16"
        >
          <path
            fill="currentColor"
            fillRule="evenodd"
            clipRule="evenodd"
            d="M7.64672 3.14665C7.74047 3.05302 7.86755 3.00043 8.00005 3.00043C8.13255 3.00043 8.25963 3.05302 8.35338 3.14665L10.8534 5.64665C10.9417 5.74144 10.9898 5.8668 10.9875 5.99634C10.9852 6.12587 10.9327 6.24946 10.8411 6.34107C10.7495 6.43268 10.6259 6.48515 10.4964 6.48744C10.3669 6.48972 10.2415 6.44164 10.1467 6.35332L8.00005 4.20665L5.85338 6.35332C5.7586 6.44164 5.63323 6.48972 5.5037 6.48744C5.37417 6.48515 5.25058 6.43268 5.15897 6.34107C5.06736 6.24946 5.01488 6.12587 5.0126 5.99634C5.01031 5.8668 5.05839 5.74144 5.14671 5.64665L7.64672 3.14665ZM5.14671 9.64666C5.24047 9.55302 5.36755 9.50043 5.50005 9.50043C5.63255 9.50043 5.75963 9.55302 5.85338 9.64666L8.00005 11.7933L10.1467 9.64666C10.1925 9.59753 10.2477 9.55813 10.309 9.5308C10.3704 9.50347 10.4366 9.48878 10.5037 9.48759C10.5708 9.48641 10.6375 9.49876 10.6998 9.52391C10.762 9.54905 10.8186 9.58648 10.8661 9.63396C10.9136 9.68144 10.951 9.738 10.9761 9.80026C11.0013 9.86252 11.0136 9.9292 11.0124 9.99634C11.0113 10.0635 10.9966 10.1297 10.9692 10.191C10.9419 10.2523 10.9025 10.3075 10.8534 10.3533L8.35338 12.8533C8.25963 12.947 8.13255 12.9995 8.00005 12.9995C7.86755 12.9995 7.74047 12.947 7.64672 12.8533L5.14671 10.3533C5.05308 10.2596 5.00049 10.1325 5.00049 9.99999C5.00049 9.86749 5.05308 9.74041 5.14671 9.64666Z"
          />
        </svg>
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-[100] max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "min-h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
