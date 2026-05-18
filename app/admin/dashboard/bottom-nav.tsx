'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/dashboard/menu', label: 'المنيو' },
  { href: '/admin/dashboard/modes', label: 'الأوضاع' },
  { href: '/admin/dashboard/analytics', label: 'التحليلات' },
  { href: '/admin/dashboard/design', label: 'التصميم' },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bg-card fixed inset-x-0 bottom-0 z-10 border-t">
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'flex h-16 items-center justify-center text-sm transition-colors ' +
                  (active
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground')
                }
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
