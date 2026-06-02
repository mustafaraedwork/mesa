import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// One status pill for the whole app — replaces the hand-rolled `rounded px-2
// py-0.5` spans in accounts-table / dashboard / modes (K6/C8). Tinted variants
// pair a soft same-hue background with a deepened `*-text` shade that clears
// WCAG AA at this size; `solid` variants are for high-emphasis counts.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        primary: "bg-primary/10 text-primary",
        success: "bg-success/12 text-success-text",
        warning: "bg-warning/15 text-warning-text",
        destructive: "bg-destructive/10 text-destructive-text",
        info: "bg-info/10 text-info-text",
        outline: "border border-border-strong text-foreground",
        solid: "bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
