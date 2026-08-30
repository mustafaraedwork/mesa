import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Self-hosted fonts via next/font/local — vendored under app/fonts/ (OFL-1.1,
// see app/fonts/LICENSE.md). This makes the production build HERMETIC: no
// build-time fetch to Google Fonts, so a Coolify/Docker build never fails on a
// fonts.googleapis.com blip. Same families/weights/appearance as before; the
// CSS variable names are unchanged so globals.css needs no edit.

// Vazirmatn — primary family. A single variable woff2 covers Arabic + Kurdish
// Sorani + Latin + Persian across the full wght axis (DESIGN-PLAN.md §ب-1:
// replaces Tajawal for full Kurdish coverage). App uses weights 300–800.
const vazirmatn = localFont({
  variable: '--ff-vazir',
  src: './fonts/vazirmatn-var.woff2',
  weight: '100 900',
  display: 'swap',
});

// Noto Sans Arabic — fallback for Kurdish/Arabic glyph coverage. Variable woff2,
// complete Arabic block. App uses weights 400/500/700.
const notoSansArabic = localFont({
  variable: '--ff-noto',
  src: './fonts/noto-sans-arabic-var.woff2',
  weight: '100 900',
  display: 'swap',
});

// IBM Plex Mono — order/invoice numerals, prices, countdown. Static per-weight
// (not variable upstream); Latin coverage is sufficient for digits/prices.
const ibmPlexMono = localFont({
  variable: '--ff-mono',
  src: [
    { path: './fonts/ibm-plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BIZIII Menu',
  description: 'منيو رقمي للمطاعم — BIZIII Menu',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${vazirmatn.variable} ${notoSansArabic.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="font-sans flex min-h-full flex-col">{children}</body>
    </html>
  );
}
