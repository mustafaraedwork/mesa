// Instant skeleton for every dashboard tab (menu/modes/design/analytics) —
// renders inside the persistent dashboard shell while a tab's data loads.
export default function Loading() {
  return (
    <div data-skeleton="dashboard" className="space-y-4">
      <div className="bg-muted h-7 w-40 animate-pulse rounded" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card flex items-center gap-3 rounded-lg border p-4">
          <div className="bg-muted h-12 w-12 shrink-0 animate-pulse rounded" />
          <div className="flex-1 space-y-2">
            <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
            <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
