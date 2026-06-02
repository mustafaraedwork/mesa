// Instant fallback while the diner page loads. Mirrors the WELCOME screen
// (the first paint): top-end language pill, centered emblem + title, bottom CTA —
// so content swaps in without a layout jump (M10).
export default function Loading() {
  return (
    <main
      data-skeleton="menu"
      className="bg-background flex min-h-screen flex-col px-6 py-6"
    >
      <div className="flex justify-end">
        <div className="bg-muted h-11 w-24 animate-pulse rounded-full" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="bg-muted h-24 w-24 animate-pulse rounded-full" />
        <div className="bg-muted h-8 w-48 animate-pulse rounded-lg" />
        <div className="bg-muted h-4 w-40 animate-pulse rounded" />
        <div className="bg-muted h-4 w-56 animate-pulse rounded" />
      </div>
      <div className="bg-muted h-14 w-full max-w-sm animate-pulse self-center rounded-2xl" />
    </main>
  );
}
