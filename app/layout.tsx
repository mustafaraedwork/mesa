import type { Metadata } from 'next';
import { Tajawal, Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Tajawal — primary Arabic family (Design-System.html §02).
const tajawal = Tajawal({
  variable: '--font-sans',
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '700', '800'],
  display: 'swap',
});

// Inter — small Latin labels / eyebrows.
const inter = Inter({
  variable: '--font-latin',
  subsets: ['latin'],
  display: 'swap',
});

// IBM Plex Mono — order/invoice numerals.
const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
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
      className={`${tajawal.variable} ${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="font-sans flex min-h-full flex-col">{children}</body>
    </html>
  );
}
