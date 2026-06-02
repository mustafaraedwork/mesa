// Neutral fallback skeleton for the dashboard shell. Each tab (menu / modes /
// analytics / design) ships its own destination-matched loading.tsx (F4); this
// only shows briefly on the /admin/dashboard → /menu redirect.
export default function Loading() {
  return (
    <div data-skeleton="dashboard" className="space-y-stack">
      <div className="bg-muted h-8 w-32 animate-pulse rounded" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={`dash-skel-${i}`} className="bg-card border-border-lite rounded-xl border p-4">
          <div className="space-y-2">
            <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
            <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
