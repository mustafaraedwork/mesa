'use client';

import { useState } from 'react';
import { LANGS, isRtl, t, type Lang } from '@/lib/i18n';

type Brand = {
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  background_color: string;
};

// Diner entry screen — shown after the QR scan, before the menu. A language
// popup opens on top; once a language is picked the diner taps "open menu".
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

  return (
    <main
      dir={isRtl(lang) ? 'rtl' : 'ltr'}
      className="relative flex min-h-screen flex-col items-center justify-center px-8 text-center"
      style={{ background: restaurant.background_color }}
    >
      {restaurant.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={restaurant.logo_url}
          alt=""
          className="mb-6 h-24 w-24 rounded-full bg-white object-contain p-1"
        />
      ) : (
        <div
          className="mb-6 flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white"
          style={{ background: restaurant.primary_color }}
        >
          {restaurant.display_name.slice(0, 1) || '·'}
        </div>
      )}

      <h1 className="text-4xl font-bold" style={{ color: restaurant.primary_color }}>
        {restaurant.display_name}
      </h1>
      <p className="mt-3 text-lg font-medium" style={{ color: restaurant.primary_color }}>
        {t(greetingKey, lang)}
      </p>
      <p className="text-muted-foreground mt-3 max-w-xs text-sm leading-7">
        {t('welcome_tagline', lang)}
      </p>

      <button
        type="button"
        onClick={onStart}
        className="shadow-lifted mt-10 rounded-lg px-8 py-3.5 text-sm font-semibold text-white"
        style={{ background: restaurant.primary_color }}
      >
        {t('open_menu', lang)} ←
      </button>

      <p className="text-muted-lite absolute bottom-6 text-[10px] tracking-widest">
        POWERED BY MESA OS
      </p>

      {langOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="bg-card shadow-modal w-full max-w-xs space-y-3 rounded-xl p-5">
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
                  className="border-border hover:bg-muted w-full rounded-lg border py-3 text-sm font-medium transition-colors"
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
