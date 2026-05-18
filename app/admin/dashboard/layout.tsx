import { requireTenant } from '@/lib/auth/require-tenant';
import { signOutTenant } from '../actions';
import { BottomNav } from './bottom-nav';

export const dynamic = 'force-dynamic';

export default async function TenantDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tenant = await requireTenant();

  return (
    <div className="bg-muted/30 flex min-h-screen flex-col pb-20">
      <header className="bg-card shadow-subtle sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">{tenant.displayName}</h1>
          {!tenant.isActive && (
            <p className="text-destructive text-xs">الحساب معطّل من قِبَل المالك</p>
          )}
        </div>
        <form action={signOutTenant}>
          <button
            type="submit"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            خروج
          </button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4">{children}</main>
      <BottomNav />
    </div>
  );
}
