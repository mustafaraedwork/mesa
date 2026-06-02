'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { LANGS, isRtl, t, type Lang } from '@/lib/i18n';
import { useReturnFocus, useSyncHtmlLang } from './_ui';

const LANG_KEY = 'mesa-lang';

type Brand = {
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  background_color: string;
};

// Diner entry screen — shown after the QR scan, before the menu. Branded with
// the tenant's logo + colours (set in the admin design tab). A language popup
// opens on top; the top-corner pill reopens it.
export function WelcomeScreen({
  restaurant,
  lang,
  onPickLang,
  onStart,
}: {
  restaurant: Brand;
  lang: Lang;
  onPickLang: (l: Lang) => void;
  onStart: () => void;
}) {
  const [langOpen, setLangOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useSyncHtmlLang(lang);
  useReturnFocus(langOpen); // restore focus to the language pill on close (2.4.3)

  // Auto-open the language picker only on the first ever visit. Once the diner
  // picks a language it's cached in localStorage, so on later visits the popup
  // stays shut — the top-corner pill still reopens it on demand.
  /* eslint-disable react-hooks/set-state-in-effect --
     Mount-time read from a client-only store (localStorage). */
  useEffect(() => {
    if (!window.localStorage.getItem(LANG_KEY)) setLangOpen(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Dismiss on Escape + move focus into the dialog and trap Tab inside it
  // while open (WCAG 2.1.1 / 4.1.2).
  useEffect(() => {
    if (!langOpen) return;
    const node = dialogRef.current;
    const focusables = node?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    focusables?.[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangOpen(false);
        return;
      }
      if (e.key === 'Tab' && focusables && focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [langOpen]);

  // One-time clock read in a lazy initializer — morning vs evening greeting.
  const [greetingKey] = useState<'greeting_morning' | 'greeting_evening'>(() =>
    new Date().getHours() < 12 ? 'greeting_morning' : 'greeting_evening',
  );

  const primary = restaurant.primary_color;
  const langLabel = LANGS.find((l) => l.code === lang)?.label ?? 'عربي';

  return (
    <main
      dir={isRtl(lang) ? 'rtl' : 'ltr'}
      className="relative flex min-h-screen flex-col overflow-hidden px-6 py-6"
      style={{ background: restaurant.background_color }}
    >
      {/* M6: soft brand-tinted atmosphere so the entry doesn't read as a blank void */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(120% 70% at 50% 22%, ${primary}1f, transparent 60%)` }}
      />
      {/* Top — language pill */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setLangOpen(true)}
          className="flex min-h-11 items-center gap-1 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ borderColor: `${primary}55`, color: primary, outlineColor: primary }}
        >
          {langLabel}
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Middle — emblem block */}
      <div className="relative flex flex-1 flex-col items-center justify-center text-center">
        <div
          className="mb-6 flex h-28 w-28 items-center justify-center rounded-full"
          style={{
            background: `${primary}12`,
            boxShadow: `0 0 0 1px ${primary}22, 0 16px 44px ${primary}1a`,
          }}
        >
          {restaurant.logo_url ? (
            <span className="relative block h-24 w-24 overflow-hidden rounded-full">
              <Image
                src={restaurant.logo_url}
                alt={restaurant.display_name}
                fill
                sizes="96px"
                priority
                className="object-contain"
              />
            </span>
          ) : (
            <span className="text-display font-bold" style={{ color: primary }}>
              {restaurant.display_name.slice(0, 1) || '·'}
            </span>
          )}
        </div>

        <h1 className="text-display font-bold" style={{ color: primary }}>
          {restaurant.display_name}
        </h1>
        <p className="text-accent-text mt-3 text-lead font-medium">{t(greetingKey, lang)}</p>
        <p className="text-muted-foreground mt-4 max-w-xs text-body">
          {t('welcome_tagline', lang)}
        </p>
      </div>

      {/* Bottom — CTA */}
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={onStart}
          className="shadow-lifted flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ background: primary, outlineColor: primary }}
        >
          {t('open_menu', lang)}
          <ArrowRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
        </button>
        <p className="text-muted-lite text-caption tracking-[0.18em]">POWERED BY MESA OS</p>
      </div>

      {/* Language popup */}
      {langOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
          onClick={() => setLangOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-lang-title"
            className="bg-card shadow-modal w-full max-w-xs space-y-3 rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="welcome-lang-title" className="text-center text-lead font-semibold">
              {t('choose_lang', lang)}
            </h2>
            <div className="space-y-2">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    onPickLang(l.code);
                    setLangOpen(false);
                  }}
                  className={
                    'min-h-12 w-full rounded-xl border text-body font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring] ' +
                    (l.code === lang
                      ? 'border-primary bg-primary/5'
                      : 'border-border-strong hover:bg-muted')
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
