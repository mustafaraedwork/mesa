// Skeleton that mirrors the modes screen: header + 3 mode cards (F4).
export default function ModesLoading() {
  return (
    <div data-skeleton="modes" className="space-y-section">
      <div className="flex items-center justify-between">
        <div className="bg-muted h-8 w-24 animate-pulse rounded" />
        <div className="bg-muted h-6 w-16 animate-pulse rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`mode-${i}`} className="bg-card border-border-lite rounded-xl border p-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="bg-muted size-10 animate-pulse rounded-xl" />
                  <div className="bg-muted h-5 w-24 animate-pulse rounded" />
                </div>
                <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
                <div className="bg-muted h-11 w-full animate-pulse rounded-lg" />
              </div>
              <div className="bg-muted h-28 w-full animate-pulse rounded-lg sm:w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
