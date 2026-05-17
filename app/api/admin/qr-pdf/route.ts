import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// A4 in PDF points (1 pt = 1/72 inch).
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export async function GET() {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();

  const { data: rest } = await sb
    .from('restaurants')
    .select('slug, display_name')
    .eq('id', restaurantId)
    .maybeSingle();
  if (!rest) return new NextResponse('not found', { status: 404 });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const menuUrl = `${appUrl}/r/${rest.slug}`;

  const qrPng = await QRCode.toBuffer(menuUrl, {
    width: 1200,
    margin: 1,
    errorCorrectionLevel: 'M',
    type: 'png',
  });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const png = await pdf.embedPng(qrPng);

  // Center a 380pt-wide QR (~13cm) on the page; leaves ~10cm of vertical room
  // above for the restaurant name and below for the URL.
  const qrSize = 380;
  const qrX = (A4_WIDTH - qrSize) / 2;
  const qrY = (A4_HEIGHT - qrSize) / 2 - 20;

  // Display name as title — Helvetica only renders Latin glyphs, so non-Latin
  // names get sanitized to ASCII (otherwise pdf-lib throws). PRD §3.4 only
  // requires the QR + URL on the print sheet; the title is a courtesy.
  const safeTitle = sanitizeAscii(rest.display_name).trim() || 'Menu';
  const titleSize = 28;
  const titleWidth = fontBold.widthOfTextAtSize(safeTitle, titleSize);
  page.drawText(safeTitle, {
    x: (A4_WIDTH - titleWidth) / 2,
    y: A4_HEIGHT - 90,
    size: titleSize,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const subtitle = 'Scan to view menu';
  const subtitleSize = 14;
  const subtitleWidth = font.widthOfTextAtSize(subtitle, subtitleSize);
  page.drawText(subtitle, {
    x: (A4_WIDTH - subtitleWidth) / 2,
    y: A4_HEIGHT - 120,
    size: subtitleSize,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawImage(png, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const urlSize = 12;
  const urlWidth = font.widthOfTextAtSize(menuUrl, urlSize);
  page.drawText(menuUrl, {
    x: (A4_WIDTH - urlWidth) / 2,
    y: qrY - 40,
    size: urlSize,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  const bytes = await pdf.save();
  // pdf-lib returns Uint8Array; copy to a fresh ArrayBuffer for NextResponse.
  const out = new Uint8Array(bytes);
  return new NextResponse(out, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="qr-${rest.slug}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

function sanitizeAscii(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ');
}
