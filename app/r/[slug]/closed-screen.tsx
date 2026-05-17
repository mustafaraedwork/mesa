// Static fallback shown when slug doesn't exist OR `restaurants.is_active=false`.
// PRD §3.3: "هذا المنيو غير متوفر حالياً". Server-rendered only — no language
// switcher here since we don't know which restaurant the diner was looking up.

export function ClosedScreen() {
  return (
    <main
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center"
    >
      <div className="text-5xl">🚫</div>
      <h1 className="text-xl font-semibold">هذا المنيو غير متوفر حالياً</h1>
      <p className="text-muted-foreground text-sm">يرجى مراجعة المطعم.</p>
    </main>
  );
}
