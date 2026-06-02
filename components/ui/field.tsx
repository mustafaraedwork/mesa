import * as React from "react"

import { cn } from "@/lib/utils"

// Shared form field: a label that implicitly wraps its control (so clicking the
// label focuses it — works for <input> and base-ui's <button>-based Select),
// with an accessible required marker and optional hint/error. Replaces the
// 4–5 duplicated `Field` definitions across the menu/design/modes dialogs (K6).
//
// `group` switches the wrapper from <label> to a labelled <div role="group">:
// use it when the content is a *set* of controls (chip toggles, a checkbox
// list) rather than one control, so the heading doesn't bind to — and
// accidentally activate — the first button, and labels don't nest.
function Field({
  label,
  required = false,
  hint,
  error,
  group = false,
  className,
  children,
}: {
  label: React.ReactNode
  required?: boolean
  hint?: React.ReactNode
  error?: React.ReactNode
  group?: boolean
  className?: string
  children: React.ReactNode
}) {
  const heading = (
    <span className="flex items-center gap-1 text-sm font-medium">
      {label}
      {required && (
        <>
          <span aria-hidden className="text-destructive-text">
            *
          </span>
          <span className="sr-only">(مطلوب)</span>
        </>
      )}
    </span>
  )
  const extras = (
    <>
      {hint && <span className="text-caption text-muted-foreground block">{hint}</span>}
      {error && (
        <span role="alert" className="text-caption text-destructive-text block">
          {error}
        </span>
      )}
    </>
  )

  if (group) {
    return (
      <div role="group" aria-label={typeof label === "string" ? label : undefined} className={cn("space-y-1.5", className)}>
        {heading}
        {children}
        {extras}
      </div>
    )
  }

  return (
    <label className={cn("block space-y-1.5", className)}>
      {heading}
      {children}
      {extras}
    </label>
  )
}

export { Field }
