// Skeleton for the owner shell while a page's RSC data loads.
export default function OwnerLoading() {
  return (
    <div data-skeleton="owner" className="space-y-6">
      <div className="bg-muted h-7 w-40 animate-pulse rounded" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border-border-lite h-24 animate-pulse rounded-xl border" />
        ))}
      </div>
      <div className="bg-card border-border-lite space-y-3 rounded-xl border p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between border-b pb-3 last:border-0">
            <div className="space-y-2">
              <div className="bg-muted h-4 w-40 animate-pulse rounded" />
              <div className="bg-muted h-3 w-24 animate-pulse rounded" />
            </div>
            <div className="bg-muted h-6 w-16 animate-pulse rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
