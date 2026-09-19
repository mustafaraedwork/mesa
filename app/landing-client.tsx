'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getFbclid, getOrCreateBizUid, setMetaAdvancedMatching, trackMeta } from '@/lib/meta-track';

// Scroll-in reveal: fade + rise 12px, once per section (design note 1c —
// MOTION). Sections render hidden on the server and are shown the first time
// they enter the viewport; a <noscript> rule in the page keeps them visible
// without JavaScript.
export function Reveal({
  id,
  className,
  children,
}: {
  id?: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [isIn, setIsIn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Anything already at or above the fold when hydration lands (a reader who
    // scrolled before JS arrived) shows at once instead of waiting to be
    // scrolled back into view.
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setIsIn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsIn(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id={id} ref={ref} className={`${className} lp-reveal${isIn ? ' is-in' : ''}`}>
      {children}
    </section>
  );
}

export type FaqItem = { q: string; a: string };

// Accordion: row height 0fr→1fr on the spring, answer opacity over 250ms,
// "+" rotates 45° to ×. Open and close share the same curve so an interrupted
// toggle reverses from the current height (CSS transition, never a snap).
export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  return (
    <div className="lp-faq__list">
      {items.map((item, i) => {
        const isOpen = open[i] === true;
        return (
          <div key={item.q} className={`lp-faq__item${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="lp-faq__q"
              aria-expanded={isOpen}
              aria-controls={`lp-faq-a-${i}`}
              onClick={() => setOpen((s) => ({ ...s, [i]: !isOpen }))}
            >
              <span>{item.q}</span>
              <span className="lp-faq__plus" aria-hidden="true">
                +
              </span>
            </button>
            <div id={`lp-faq-a-${i}`} className="lp-faq__a" role="region">
              <div>
                <p>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// WhatsApp CTA. First tap opens a small lead-capture modal (name + phone);
// "افتح واتساب" saves the lead (/api/leads), fires Lead + Contact (pixel +
// Conversions API, shared eventIds), re-inits the pixel with advanced
// matching, and opens WhatsApp with a greeting that carries the name.
// "متابعة بدون تسجيل" is the old behaviour: Contact only, straight to WhatsApp.
// WhatsApp opens whatever the lead save returns — tracking never blocks a
// conversation.
const PHONE_RE = /^07\d{9}$/;

export function ContactLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        className={className}
        href={href}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </a>
      {/* Portal: the sticky nav's backdrop-filter (and the reveal sections'
          transforms) would otherwise become the containing block of the
          fixed overlay and trap it inside the button's ancestor. */}
      {open && createPortal(<LeadModal href={href} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function openWhatsApp(href: string, name?: string) {
  const url = name
    ? `${href}?text=${encodeURIComponent(`مرحباً، أنا ${name} وأريد تفاصيل عن BIZIII Menu`)}`
    : href;
  // Opened synchronously inside the click handler so popup blockers allow it.
  // No 'noopener' feature string: with it window.open always returns null, so
  // the blocked-popup fallback below would ALSO navigate this tab away. The
  // opener is severed by hand instead.
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
  else window.location.href = url;
}

function LeadModal({ href, onClose }: { href: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const p = phone.replace(/[\s-]/g, '');
    if (!n) {
      setError('اكتب اسمك أولاً.');
      return;
    }
    if (!PHONE_RE.test(p)) {
      setError('رقم الهاتف يجب أن يكون ١١ رقماً ويبدأ بـ07.');
      return;
    }

    const uid = getOrCreateBizUid();
    void fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ name: n, phone: p, sourceUrl: window.location.href, fbclid: getFbclid(), bizUid: uid }),
    }).catch(() => {});

    trackMeta('Lead', { phone: p, firstName: n, externalId: uid });
    setMetaAdvancedMatching({ ph: p, fn: n, external_id: uid });
    trackMeta('Contact', { phone: p, firstName: n, externalId: uid });
    openWhatsApp(href, n);
    onClose();
  }

  function skip() {
    trackMeta('Contact');
    openWhatsApp(href);
    onClose();
  }

  return (
    <div className="lp-modal" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-lead-title"
        className="lp-modal__card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <button type="button" className="lp-modal__close" onClick={onClose} aria-label="إغلاق">
          ×
        </button>
        <h2 id="lp-lead-title" className="lp-modal__title">
          خلّينا نعرفك قبل ما نبدأ
        </h2>
        <p className="lp-modal__sub">نرجع لك على واتساب بتفاصيل المنيو الخاص بمطعمك.</p>
        <label className="lp-modal__label">
          الاسم
          <input
            ref={firstField}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoComplete="name"
            className="lp-modal__input"
          />
        </label>
        <label className="lp-modal__label">
          رقم الهاتف
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            autoComplete="tel"
            placeholder="07XXXXXXXXX"
            maxLength={16}
            dir="ltr"
            className="lp-modal__input lp-modal__input--ltr"
          />
        </label>
        {error && (
          <p role="alert" className="lp-modal__error">
            {error}
          </p>
        )}
        <button type="submit" className="lp-btn lp-btn--cta lp-modal__submit">
          افتح واتساب
        </button>
        <button type="button" className="lp-modal__skip" onClick={skip}>
          متابعة بدون تسجيل
        </button>
      </form>
    </div>
  );
}
