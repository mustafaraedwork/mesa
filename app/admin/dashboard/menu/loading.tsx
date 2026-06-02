// Skeleton that mirrors the menu editor: header + category cards with rows (F4).
export default function MenuLoading() {
  return (
    <div data-skeleton="menu" className="space-y-stack">
      <div className="flex items-center justify-between">
        <div className="bg-muted h-8 w-24 animate-pulse rounded" />
        <div className="bg-muted h-4 w-28 animate-pulse rounded" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={`cat-${i}`} className="bg-card border-border-lite overflow-hidden rounded-xl border">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="bg-muted size-5 animate-pulse rounded" />
            <div className="bg-muted h-5 w-32 flex-1 animate-pulse rounded" />
            <div className="bg-muted h-9 w-20 animate-pulse rounded-md" />
            <div className="bg-muted size-9 animate-pulse rounded-md" />
          </div>
          {Array.from({ length: 2 }).map((_, j) => (
            <div key={`row-${j}`} className="flex items-center gap-3 border-t px-3 py-2.5">
              <div className="bg-muted size-5 animate-pulse rounded" />
              <div className="bg-muted size-12 animate-pulse rounded-md" />
              <div className="flex-1 space-y-2">
                <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
                <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
              </div>
              <div className="bg-muted h-6 w-11 animate-pulse rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
