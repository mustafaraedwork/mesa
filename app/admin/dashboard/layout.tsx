import { LogOut } from 'lucide-react';
import { requireTenant } from '@/lib/auth/require-tenant';
import { Button } from '@/components/ui/button';
import { ToastProvider } from '@/components/ui/toast';
import { signOutTenant } from '../actions';
import { BottomNav } from './bottom-nav';

export const dynamic = 'force-dynamic';

export default async function TenantDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tenant = await requireTenant();

  return (
    <ToastProvider>
      <div className="bg-muted/30 flex min-h-screen flex-col pb-[calc(var(--spacing-safe-b)+5rem)]">
        <header className="bg-card shadow-subtle sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-gutter py-3">
          <div className="min-w-0">
            <h1 className="truncate text-lead font-semibold">{tenant.displayName}</h1>
            {!tenant.isActive && (
              <p className="text-destructive-text text-caption">الحساب معطّل من قِبَل المالك</p>
            )}
          </div>
          <form action={signOutTenant}>
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
              <LogOut className="rtl:-scale-x-100" />
              خروج
            </Button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 p-gutter">{children}</main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
