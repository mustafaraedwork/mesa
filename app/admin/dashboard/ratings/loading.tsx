// Skeleton that mirrors ratings: header + averages card + table rows.
export default function RatingsLoading() {
  return (
    <div data-skeleton="ratings" className="space-y-section">
      <div className="space-y-2">
        <div className="bg-muted h-8 w-28 animate-pulse rounded" />
        <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
      </div>
      <div className="bg-card border-border-lite grid grid-cols-2 gap-3 rounded-xl border p-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted h-16 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-card border-border-lite rounded-xl border p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-muted my-3 h-4 animate-pulse rounded" />
        ))}
      </div>
    </div>
  );
}
