// Instant skeleton while a product page loads — matches the product layout.
export default function Loading() {
  return (
    <main data-skeleton="product" className="bg-background min-h-screen pb-28">
      <header className="bg-muted/60 flex items-center gap-3 px-4 py-3">
        <div className="bg-muted h-4 w-24 animate-pulse rounded" />
      </header>
      <div className="mx-auto max-w-2xl px-4 py-5">
        <div className="bg-card overflow-hidden rounded-xl border">
          <div className="bg-muted aspect-square w-full animate-pulse" />
          <div className="space-y-3 p-4">
            <div className="bg-muted h-6 w-1/2 animate-pulse rounded" />
            <div className="bg-muted h-5 w-1/4 animate-pulse rounded" />
            <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
            <div className="bg-muted h-11 w-full animate-pulse rounded-lg" />
          </div>
        </div>
      </div>
    </main>
  );
}
