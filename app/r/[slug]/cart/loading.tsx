// Instant skeleton while the cart page loads — matches the cart layout.
export default function Loading() {
  return (
    <main data-skeleton="cart" className="bg-background min-h-screen pb-32">
      <header className="bg-muted/60 flex items-center gap-3 px-4 py-3">
        <div className="bg-muted h-4 w-24 animate-pulse rounded" />
      </header>
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card flex items-center gap-3 rounded-xl border p-3">
            <div className="bg-muted h-16 w-16 shrink-0 animate-pulse rounded" />
            <div className="flex-1 space-y-2">
              <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
              <div className="bg-muted h-3 w-1/4 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
