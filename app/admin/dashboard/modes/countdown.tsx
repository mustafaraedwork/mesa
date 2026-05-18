'use client';

import { useEffect, useState } from 'react';

// Countdown driven by `setInterval(1000)` against `endsAt - (Date.now()+offset)`.
// `offsetMs` corrects for tenant devices whose system clock drifts (Q12).
export function Countdown({ endsAt, offsetMs }: { endsAt: string; offsetMs: number }) {
  // Start as null so SSR and first client render match — Date.now() diverges
  // between the two and would otherwise trip a hydration mismatch (React #418).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the clock client-side only (see null-init note above)
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return (
      <p dir="ltr" className="text-left text-2xl font-bold text-destructive tabular-nums">
        --:--:--
      </p>
    );
  }

  const remaining = new Date(endsAt).getTime() + offsetMs - now;

  if (remaining <= 0) {
    return (
      <p className="text-destructive text-sm">
        انتهى — في انتظار التحديث
      </p>
    );
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <p
      dir="ltr"
      className="text-left text-2xl font-bold text-destructive tabular-nums"
    >
      {pad(h)}:{pad(m)}:{pad(s)}
    </p>
  );
}
