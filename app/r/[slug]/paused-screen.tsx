// Shown to a DINER when the restaurant's subscription has lapsed past its
// grace window (migration 0016).
//
// Why this is not ClosedScreen: that one says «هذا المنيو غير متوفر حالياً …
// يرجى مراجعة المطعم» — which reads as "the restaurant is closed". A diner
// seeing it is sitting at a table, in an open restaurant, with staff walking
// past. Telling them the place is closed is both false and embarrassing for
// the restaurant.
//
// So the wording here:
//   • says the DIGITAL MENU is temporarily unavailable, not the restaurant;
//   • gives the diner something to actually do right now — ask for a menu;
//   • never mentions subscriptions, payment, expiry, or the platform's
//     relationship with the restaurant. A billing matter between BIZIII and
//     its customer is nobody else's business, least of all a guest's.

import { UtensilsCrossed } from 'lucide-react';

export function PausedScreen() {
  return (
    <main
      lang="ar"
      dir="rtl"
      className="bg-background flex min-h-screen flex-col items-center justify-center px-6"
    >
      <div className="bg-card border-border-lite shadow-card flex max-w-sm flex-col items-center gap-4 rounded-3xl border px-10 py-14 text-center">
        <span className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
          <UtensilsCrossed className="text-muted-foreground h-8 w-8" aria-hidden />
        </span>
        <h1 className="text-h3 font-semibold">المنيو الرقمي متوقّف مؤقتاً</h1>
        <p className="text-muted-foreground text-body">
          يمكنك طلب المنيو من أحد العاملين — نعتذر عن الإزعاج.
        </p>
      </div>
    </main>
  );
}
