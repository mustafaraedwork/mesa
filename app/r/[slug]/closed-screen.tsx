// Static fallback shown when slug doesn't exist OR `restaurants.is_active=false`.
// PRD §3.3: "هذا المنيو غير متوفر حالياً". Server-rendered only — no language
// switcher here since we don't know which restaurant the diner was looking up.

import { Coffee } from 'lucide-react';

export function ClosedScreen() {
  return (
    <main
      dir="rtl"
      className="bg-background flex min-h-screen flex-col items-center justify-center px-6"
    >
      <div className="bg-card border-border-lite shadow-card flex flex-col items-center gap-4 rounded-3xl border px-10 py-14 text-center">
        <span className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
          <Coffee className="text-muted-foreground h-8 w-8" aria-hidden />
        </span>
        <h1 className="text-h3 font-semibold">هذا المنيو غير متوفر حالياً</h1>
        <p className="text-muted-foreground text-body">يرجى مراجعة المطعم.</p>
      </div>
    </main>
  );
}
