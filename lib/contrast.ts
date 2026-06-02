// WCAG 2.x contrast utilities for the design tab's live readability guards
// (C5/F7). Pure functions over `#rrggbb` hex (what `<input type=color>` yields).

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio (1–21) between two hex colors, or null if either is invalid. */
export function contrastRatio(hex1: string, hex2: string): number | null {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  if (!a || !b) return null;
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick white or near-black ink — whichever reads better on the given background. */
export function readableTextOn(hex: string): '#ffffff' | '#1a1a1a' {
  const white = contrastRatio(hex, '#ffffff') ?? 0;
  const ink = contrastRatio(hex, '#1a1a1a') ?? 0;
  return white >= ink ? '#ffffff' : '#1a1a1a';
}
