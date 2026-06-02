// Skeleton that mirrors the design tab: form column + live preview column (F4).
export default function DesignLoading() {
  return (
    <div data-skeleton="design" className="space-y-section">
      <div className="flex items-baseline justify-between">
        <div className="bg-muted h-8 w-24 animate-pulse rounded" />
        <div className="bg-muted h-4 w-40 animate-pulse rounded" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border-border-lite space-y-3 rounded-xl border p-4">
              <div className="bg-muted h-5 w-32 animate-pulse rounded" />
              <div className="bg-muted h-11 w-full animate-pulse rounded-lg" />
              <div className="bg-muted h-11 w-full animate-pulse rounded-lg" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="bg-muted h-4 w-24 animate-pulse rounded" />
          <div className="bg-muted h-72 w-full animate-pulse rounded-xl" />
        </div>
      </div>
    </div>
  );
}
