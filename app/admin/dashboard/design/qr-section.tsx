'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';

export function QrSection({ menuUrl, slug }: { menuUrl: string; slug: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  // Render the QR onto the canvas whenever the URL changes.
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, menuUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    }).catch(() => {
      // Rendering errors are unrecoverable here — leave the canvas blank.
    });
  }, [menuUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
