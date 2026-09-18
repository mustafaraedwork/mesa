'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

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
