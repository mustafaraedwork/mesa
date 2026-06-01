import type { Metadata } from 'next';
import { Vazirmatn, Noto_Sans_Arabic, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Vazirmatn — primary family. Covers Arabic + Kurdish Sorani + Latin
// (decision in DESIGN-PLAN.md §ب-1: replaces Tajawal for full Kurdish coverage).
const vazirmatn = Vazirmatn({
  variable: '--ff-vazir',
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

// Noto Sans Arabic — fallback for Kurdish glyph coverage.
const notoSansArabic = Noto_Sans_Arabic({
  variable: '--ff-noto',
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

// IBM Plex Mono — order/invoice numerals, prices, countdown.
const ibmPlexMono = IBM_Plex_Mono({
  variable: '--ff-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mesa OS Lite',
  description: 'منيو رقمي للمطاعم — Mesa OS Lite',
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
