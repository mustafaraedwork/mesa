// Shown to a TENANT whose subscription lapsed past the grace window.
//
// Deliberately NOT under /admin/dashboard: requireTenant() redirects here, so
// living inside the dashboard tree would make it re-enter that function and
// redirect to itself forever.
//
// It resolves the session itself — WITHOUT the subscription check — so it can
// greet the restaurant by name instead of showing an anonymous error, and so
// it can send a still-valid tenant straight back to the dashboard the moment a
// payment is recorded (no logout, no cache to clear, nothing to explain).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { getRestaurantIdFromCookie } from '@/lib/auth/session';
import { getServiceClient } from '@/lib/supabase/server';
import { deriveSubscription } from '@/lib/subscription';
import { bagDate } from '@/lib/billing';
import { Button, buttonVariants } from '@/components/ui/button';
import { signOutTenant } from '../actions';

export const dynamic = 'force-dynamic';

// Loading lives outside the component so the clock read stays out of render —
// same split the owner pages use (loadAccounts, loadOverview).
async function loadSuspended() {
  const restaurantId = await getRestaurantIdFromCookie();
  if (!restaurantId) redirect('/admin');

  const sb = getServiceClient();
  const { data } = await sb
    .from('restaurants')
    .select('display_name, deleted_at, subscription_ends_at')
    .eq('id', restaurantId)
    .maybeSingle();

  if (!data || data.deleted_at) redirect('/admin');

  return {
    displayName: data.display_name as string,
    subscription: deriveSubscription(data.subscription_ends_at, Date.now()),
  };
}

export default async function TenantSuspendedPage() {
  const { displayName, subscription } = await loadSuspended();

  // Renewal recorded → the block is gone. Send them back in immediately.
  if (!subscription.isBlocked) redirect('/admin/dashboard');

  return (
    <main
      lang="ar"
      dir="rtl"
      className="bg-muted/30 flex min-h-screen flex-col items-center justify-center px-gutter py-12"
    >
      <div className="bg-card shadow-card w-full max-w-md space-y-5 rounded-3xl border p-8 text-center">
        <span className="bg-destructive/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <AlertCircle className="text-destructive-text h-8 w-8" aria-hidden />
        </span>

        <div className="space-y-2">
          <h1 className="text-h3 font-semibold">انتهى اشتراك {displayName}</h1>
          <p className="text-muted-foreground text-body">
            تمّ إيقاف لوحة التحكّم ومنيو الزبائن مؤقتاً بعد انتهاء مدّة الاشتراك ومهلة
            التجديد.
          </p>
        </div>

        <div className="bg-muted/50 rounded-xl px-4 py-3 text-sm">
          <span className="text-muted-foreground">تاريخ انتهاء الاشتراك: </span>
          <span dir="ltr" className="font-medium">
            {bagDate(subscription.endsAt)}
          </span>
        </div>

        <p className="text-body">
          للتجديد وإعادة تفعيل الحساب، تواصل مع <strong>BIZIII</strong>. يعود كل شيء —
          المنيو وبياناتك كما هي — فور تسجيل الدفعة.
        </p>

        <div className="flex flex-col gap-2">
          {/* Not a client-side refresh: the whole point is to re-run the
              server check after the owner records the payment. */}
          <Link href="/admin/dashboard" className={buttonVariants({ variant: 'outline' })}>
            تحقّق مرة أخرى
          </Link>
          <form action={signOutTenant}>
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground w-full">
              تسجيل الخروج
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
