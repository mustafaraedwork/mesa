"use client"

import * as React from "react"
import { Toast } from "@base-ui/react/toast"
import {
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

// App-wide toast system on base-ui (A4) — replaces the inline `<p>` success/
// error messages that shifted layout, and gives the central mode switch its
// "applied — visible to diners within ~30s" confirmation (A3) and the menu
// availability toggle its success/failure feedback (F1).

type ToastType = "success" | "error" | "warning" | "info"

const TYPE_META: Record<
  ToastType,
  { Icon: typeof InfoIcon; accent: string }
> = {
  success: { Icon: CheckCircle2Icon, accent: "text-success-text" },
  error: { Icon: XCircleIcon, accent: "text-destructive-text" },
  warning: { Icon: TriangleAlertIcon, accent: "text-warning-text" },
  info: { Icon: InfoIcon, accent: "text-info-text" },
}

/** Re-export the manager hook under a project name. Call inside `ToastProvider`. */
export function useToast() {
  return Toast.useToastManager()
}

/** Wrap the dashboard so descendants can call `useToast()`; renders the viewport. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toaster />
    </Toast.Provider>
  )
}

function Toaster() {
  const { toasts } = Toast.useToastManager()
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed inset-x-0 bottom-[calc(var(--spacing-safe-b)+4.75rem)] z-[70] mx-auto flex w-full max-w-sm flex-col gap-2 px-4">
        {toasts.map((toast) => {
          const meta = TYPE_META[(toast.type as ToastType) ?? "info"] ?? TYPE_META.info
          const { Icon } = meta
          return (
            <Toast.Root
              key={toast.id}
              toast={toast}
              swipeDirection="down"
              className={cn(
                "bg-popover border-border-lite text-popover-foreground shadow-modal flex items-start gap-3 rounded-xl border p-3.5",
                "transition-[transform,opacity] duration-[var(--animate-duration-normal)] ease-[var(--ease-out-expo)]",
                "data-[starting-style]:translate-y-3 data-[starting-style]:opacity-0",
                "data-[ending-style]:translate-y-3 data-[ending-style]:opacity-0",
                "data-[swiping]:translate-y-[var(--toast-swipe-movement-y)] data-[swiping]:transition-none"
              )}
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", meta.accent)} aria-hidden />
              <div className="min-w-0 flex-1">
                <Toast.Title className="text-sm font-medium" />
                <Toast.Description className="text-caption text-muted-foreground mt-0.5" />
              </div>
              <Toast.Close
                aria-label="إغلاق"
                className="text-muted-foreground hover:text-foreground -m-1 flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon className="size-4" />
              </Toast.Close>
            </Toast.Root>
          )
        })}
      </Toast.Viewport>
    </Toast.Portal>
  )
}
