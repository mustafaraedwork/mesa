'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Angry, Frown, Laugh, Meh, Smile, Star, X } from 'lucide-react';
import { t, type Lang } from '@/lib/i18n';
import { useReturnFocus } from './_ui';

// Bottom sheet opened from the «تقييم» header button. Three 1–5 star rows, a
// 1–5 face row for the overall experience, then optional name / phone /
// comment — the same sections as the reference screenshot, plus the name
// field. Posts to /api/rate (migration 0020).

type Scores = { staff: number; service: number; clean: number; overall: number };
const EMPTY: Scores = { staff: 0, service: 0, clean: 0, overall: 0 };

const FACES = [Angry, Frown, Meh, Smile, Laugh] as const;

export function RatingSheet({
  slug,
  lang,
  open,
  onClose,
}: {
  slug: string;
  lang: Lang;
  open: boolean;
  onClose: () => void;
}) {
  const [scores, setScores] = useState<Scores>(EMPTY);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'required' | 'failed'>('idle');
  const panelRef = useRef<HTMLDivElement>(null);
  useReturnFocus(open);

  // Escape closes; body scroll is locked while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const setScore = (key: keyof Scores, value: number) => {
    setScores((s) => ({ ...s, [key]: value }));
    if (status === 'required') setStatus('idle');
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (Object.values(scores).some((v) => v === 0)) {
      setStatus('required');
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch('/api/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ...scores, name, phone, comment }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 animate-in duration-200 fade-in-0"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-title"
        tabIndex={-1}
        className="bg-background shadow-modal flex max-h-[92vh] w-full max-w-lg animate-in flex-col rounded-t-3xl duration-300 slide-in-from-bottom-8 [animation-timing-function:var(--ease-out-expo)] focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-gutter pt-3 pb-1">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', lang)}
            className="bg-card border-border-lite flex h-10 w-10 items-center justify-center rounded-full border transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <h2 id="rating-title" className="text-h3 font-bold">
            {t('rate_title', lang)}
          </h2>
          <span className="w-10" aria-hidden />
        </div>

        {status === 'sent' ? (
          <div className="flex flex-col items-center gap-4 px-gutter py-14 text-center">
            <Laugh className="text-primary h-12 w-12" aria-hidden />
            <p className="text-lead font-semibold">{t('rate_thanks', lang)}</p>
            <button
              type="button"
              onClick={onClose}
              className="bg-primary text-primary-foreground min-h-12 rounded-xl px-8 text-body font-semibold transition-transform active:scale-[.98]"
            >
              {t('close', lang)}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 overflow-y-auto px-gutter pb-[calc(var(--spacing-safe-b)+1rem)]">
            <Section label={t('rate_staff', lang)}>
              <Stars value={scores.staff} onChange={(v) => setScore('staff', v)} label={t('rate_staff', lang)} />
            </Section>
            <Section label={t('rate_service', lang)}>
              <Stars value={scores.service} onChange={(v) => setScore('service', v)} label={t('rate_service', lang)} />
            </Section>
            <Section label={t('rate_clean', lang)}>
              <Stars value={scores.clean} onChange={(v) => setScore('clean', v)} label={t('rate_clean', lang)} />
            </Section>
            <Section label={t('rate_overall', lang)}>
              {/* Angry → delighted always reads left-to-right, like the star rows. */}
              <div role="radiogroup" aria-label={t('rate_overall', lang)} dir="ltr" className="flex justify-between px-2">
                {FACES.map((Face, i) => {
                  const v = i + 1;
                  const on = scores.overall === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={String(v)}
                      onClick={() => setScore('overall', v)}
                      className={
                        'flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring] ' +
                        (on ? 'bg-primary text-primary-foreground scale-110' : 'text-muted-foreground hover:bg-muted')
                      }
                    >
                      <Face className="h-7 w-7" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section label={t('rate_contact', lang)}>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  placeholder={t('rate_name', lang)}
                  aria-label={t('rate_name', lang)}
                  className="bg-card border-border-strong min-h-12 w-full rounded-xl border px-4 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={32}
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder={t('rate_phone', lang)}
                  aria-label={t('rate_phone', lang)}
                  className="bg-card border-border-strong min-h-12 w-full rounded-xl border px-4 text-center text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
                />
              </div>
            </Section>

            <Section label={t('rate_comment', lang)}>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder={t('rate_comment_ph', lang)}
                aria-label={t('rate_comment', lang)}
                className="bg-card border-border-strong w-full resize-none rounded-xl border px-4 py-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
              />
            </Section>

            {(status === 'required' || status === 'failed') && (
              <p role="alert" className="text-destructive-text text-center text-sm">
                {t(status === 'required' ? 'rate_required' : 'rate_failed', lang)}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="bg-primary text-primary-foreground shadow-cta min-h-14 w-full rounded-xl text-lead font-semibold transition-transform active:scale-[.98] disabled:opacity-60"
            >
              {t('rate_submit', lang)}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card border-border-lite shadow-card rounded-2xl border px-4 py-4">
      <p className="mb-3 text-center text-body font-semibold">{label}</p>
      {children}
    </div>
  );
}

function Stars({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} dir="ltr" className="flex justify-center gap-2">
      {[1, 2, 3, 4, 5].map((v) => {
        const on = v <= value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={String(v)}
            onClick={() => onChange(v)}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
          >
            <Star
              className={'h-7 w-7 transition-colors ' + (on ? 'text-gold' : 'text-muted-foreground/50')}
              fill={on ? 'currentColor' : 'none'}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}
