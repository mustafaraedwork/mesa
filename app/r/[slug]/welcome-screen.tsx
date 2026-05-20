'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LANGS, isRtl, t, type Lang } from '@/lib/i18n';

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
  const [langOpen, setLangOpen] = useState(true);

  // One-time clock read in a lazy initializer — morning vs evening greeting.
  const [greetingKey] = useState<'greeting_morning' | 'greeting_evening'>(() =>
    new Date().getHours() < 12 ? 'greeting_morning' : 'greeting_evening',
  );

  const primary = restaurant.primary_color;
  const langLabel = LANGS.find((l) => l.code === lang)?.label ?? 'عربي';

  return (
    <main
      dir={isRtl(lang) ? 'rtl' : 'ltr'}
      className="flex min-h-screen flex-col px-6 py-6"
      style={{ background: restaurant.background_color }}
    >
      {/* Top — language pill */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setLangOpen(true)}
          className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: `${primary}33`, color: primary }}
        >
          {langLabel}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Middle — emblem block */}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full">
          {restaurant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.logo_url}
              alt=""
              className="h-14 w-14 rounded-full object-contain"
            />
          ) : (
            <span className="text-2xl font-bold" style={{ color: primary }}>
              {restaurant.display_name.slice(0, 1) || '·'}
            </span>
          )}
        </div>

        <h1 className="text-4xl font-bold tracking-tight" style={{ color: primary }}>
          {restaurant.display_name}
        </h1>
        <p className="text-gold mt-3 text-lg font-medium">{t(greetingKey, lang)}</p>
        <p className="text-muted-foreground mt-4 max-w-xs text-sm leading-7">
          {t('welcome_tagline', lang)}
        </p>
      </div>

      {/* Bottom — CTA */}
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={onStart}
          className="shadow-lifted w-full max-w-sm rounded-xl py-4 text-base font-semibold text-white"
          style={{ background: primary }}
        >
          {t('open_menu', lang)} ←
        </button>
        <p className="text-muted-lite text-[10px] tracking-[0.2em]">POWERED BY MESA OS</p>
      </div>

      {/* Language popup */}
      {langOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
          <div className="bg-card border-foreground shadow-modal w-full max-w-xs space-y-3 rounded-xl border-2 p-6">
            <h2 className="text-center text-base font-semibold">{t('choose_lang', lang)}</h2>
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
                    'w-full rounded-lg border py-3 text-sm font-medium transition-colors ' +
                    (l.code === lang
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted')
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
