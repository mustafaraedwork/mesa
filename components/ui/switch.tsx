"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// On/off switch on base-ui. Used for the menu availability toggle and the
// "show unavailable items" design setting (K2). `on` reads as success-green
// (the universal "live/available" signal); the thumb travel is mirrored under
// RTL so it always slides toward the inline-end.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors outline-none",
        "bg-border-strong data-[checked]:bg-success",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-5 rounded-full bg-card shadow-sm transition-transform data-[checked]:translate-x-5 rtl:data-[checked]:-translate-x-5" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
