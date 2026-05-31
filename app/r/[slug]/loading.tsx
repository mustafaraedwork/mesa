// Instant fallback while the diner menu loads (precedes the welcome screen).
// Centered to transition smoothly into the branded welcome layout.
export default function Loading() {
  return (
    <main
      data-skeleton="menu"
      className="bg-background flex min-h-screen flex-col items-center justify-center gap-4 px-6"
    >
      <div className="bg-muted h-20 w-20 animate-pulse rounded-full" />
      <div className="bg-muted h-6 w-40 animate-pulse rounded" />
      <div className="bg-muted h-4 w-56 animate-pulse rounded" />
    </main>
  );
}
