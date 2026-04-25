"use client";

import * as React from "react";

import {cn} from "@/lib/utils";

type SwitchProps = Omit<React.ComponentProps<"button">, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({className, checked, onCheckedChange, disabled, ...props}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent px-0.5 transition-colors",
        "bg-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "data-[state=checked]:justify-end data-[state=checked]:bg-primary",
        "data-[state=unchecked]:justify-start",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      onClick={() => !disabled && onCheckedChange(!checked)}
      {...props}
    >
      <span className="pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0" />
    </button>
  );
}
