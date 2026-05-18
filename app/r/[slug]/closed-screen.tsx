// Static fallback shown when slug doesn't exist OR `restaurants.is_active=false`.
// PRD §3.3: "هذا المنيو غير متوفر حالياً". Server-rendered only — no language
// switcher here since we don't know which restaurant the diner was looking up.

export function ClosedScreen() {
  return (
    <main
      dir="rtl"
      className="bg-background flex min-h-screen flex-col items-center justify-center px-6"
    >
      <div className="bg-card border-border-lite shadow-card flex flex-col items-center gap-3 rounded-xl border px-10 py-12 text-center">
        <div className="text-5xl">🚫</div>
        <h1 className="text-xl font-semibold">هذا المنيو غير متوفر حالياً</h1>
        <p className="text-muted-foreground text-sm">يرجى مراجعة المطعم.</p>
      </div>
    </main>
  );
}
