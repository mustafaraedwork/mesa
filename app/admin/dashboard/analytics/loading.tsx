// Skeleton that mirrors analytics: header + bar-chart card + product list (F4).
export default function AnalyticsLoading() {
  return (
    <div data-skeleton="analytics" className="space-y-section">
      <div className="space-y-2">
        <div className="bg-muted h-8 w-28 animate-pulse rounded" />
        <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
      </div>

      <div className="bg-card border-border-lite rounded-xl border p-4">
        <div className="bg-muted mb-4 h-5 w-40 animate-pulse rounded" />
        <div className="flex h-36 items-end justify-between gap-1.5">
          {[40, 70, 30, 90, 55, 75, 100].map((h, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="bg-muted w-full animate-pulse rounded-t-md" style={{ height: `${h}%` }} />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border-border-lite rounded-xl border p-4">
        <div className="bg-muted mb-4 h-5 w-44 animate-pulse rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5 border-t py-2.5 first:border-t-0">
            <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
            <div className="bg-muted h-2 w-full animate-pulse rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
