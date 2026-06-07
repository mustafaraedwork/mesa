import { BarChart3, LayoutGrid, LogOut, Receipt, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToastProvider } from '@/components/ui/toast';
import { signOutOwner } from '../actions';
import { OwnerNavLink } from './owner-nav-link';

export default function OwnerDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ToastProvider>
      <div className="bg-muted/40 min-h-screen">
        <header className="bg-card shadow-subtle sticky top-0 z-20 border-b">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-gutter py-3">
            <div className="flex items-center gap-4">
              <span className="text-primary flex items-center gap-2 font-semibold">
                <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-sm">
                  M
                </span>
                <span className="hidden sm:inline">Mesa OS Lite</span>
              </span>
              <nav className="flex items-center gap-1">
                <OwnerNavLink href="/owner/dashboard" exact>
                  <LayoutGrid className="size-4" />
                  نظرة عامة
                </OwnerNavLink>
                <OwnerNavLink href="/owner/dashboard/accounts">
                  <Store className="size-4" />
                  المطاعم
                </OwnerNavLink>
                <OwnerNavLink href="/owner/dashboard/billing">
                  <Receipt className="size-4" />
                  الفوترة
                </OwnerNavLink>
                <OwnerNavLink href="/owner/dashboard/analytics">
                  <BarChart3 className="size-4" />
                  التحليلات
                </OwnerNavLink>
              </nav>
            </div>
            <form action={signOutOwner}>
              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
                <LogOut className="rtl:-scale-x-100" />
                <span className="hidden sm:inline">خروج</span>
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-5xl p-gutter">{children}</main>
      </div>
    </ToastProvider>
  );
}
