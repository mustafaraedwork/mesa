'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { APP_URL_MISSING_MESSAGE } from '@/lib/app-url';

export function QrSection({ menuUrl, slug }: { menuUrl: string | null; slug: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Q-28: clear the "copied" reset timer on unmount.
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  // Render the QR onto the canvas whenever the URL changes.
  useEffect(() => {
    if (!canvasRef.current || !menuUrl) return;
    QRCode.toCanvas(canvasRef.current, menuUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    }).catch(() => {
      // Rendering errors are unrecoverable here — leave the canvas blank.
    });
  }, [menuUrl]);

  async function copyLink() {
    if (!menuUrl) return;
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers without clipboard API: ignore.
    }
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${slug}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadPdf() {
    // The PDF route streams an A4 page with the QR centered + the URL.
    window.location.href = `/api/admin/qr-pdf`;
  }

  // Production build without NEXT_PUBLIC_APP_URL. Everything else on the
  // design tab still works; only the QR surface is withheld, because the
  // alternative is handing the owner a printable code pointing at localhost.
  if (!menuUrl) {
    return (
      <div
        role="status"
        className="border-warning/40 bg-warning/10 space-y-1 rounded-md border p-4"
      >
        <p className="text-sm font-medium">{APP_URL_MISSING_MESSAGE}</p>
        <p className="text-muted-foreground text-xs">
          لا يمكن توليد رمز QR أو رابط المنيو حتى يُضبط دومين المنصّة. لا تطبع أي رمز
          قبل ذلك.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
      <div className="flex flex-col items-center gap-2">
        <canvas ref={canvasRef} className="rounded border bg-white p-2" />
        <p className="text-muted-foreground text-xs">امسح للمعاينة</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium">رابط المنيو</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={menuUrl}
              dir="ltr"
              className="border-input bg-muted/50 h-9 flex-1 rounded-md border px-3 text-sm"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="outline" onClick={copyLink}>
              {copied ? 'تم النسخ' : 'نسخ'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={downloadPng}>
            تحميل PNG
          </Button>
          <Button type="button" variant="outline" onClick={downloadPdf}>
            تحميل PDF (A4)
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          الـQR يُعاد توليده تلقائياً لو غيّرت الـslug من المالك.
        </p>
      </div>
    </div>
  );
}
