'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Palette, SlidersHorizontal, UtensilsCrossed } from 'lucide-react';

const TABS = [
  { href: '/admin/dashboard/menu', label: 'المنيو', Icon: UtensilsCrossed },
  { href: '/admin/dashboard/modes', label: 'الأوضاع', Icon: SlidersHorizontal },
  { href: '/admin/dashboard/analytics', label: 'التحليلات', Icon: BarChart3 },
  { href: '/admin/dashboard/design', label: 'التصميم', Icon: Palette },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bg-card fixed inset-x-0 bottom-0 z-20 border-t pb-[var(--spacing-safe-b)]">
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={
                  'relative flex h-16 flex-col items-center justify-center gap-1 text-caption transition-colors ' +
                  (active
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground')
                }
              >
                {active && (
                  <span className="bg-primary absolute inset-x-7 top-0 h-0.5 rounded-full" aria-hidden />
                )}
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
