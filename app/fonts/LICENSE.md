# Vendored fonts — licenses

All three families are self-hosted (vendored) so the production build needs no
network access to Google Fonts. Each is licensed under the **SIL Open Font
License 1.1 (OFL-1.1)**, which permits bundling, self-hosting, and
redistribution. Source files are pinned for reproducibility.

| File | Family | Upstream (pinned) |
|---|---|---|
| `vazirmatn-var.woff2` | Vazirmatn (variable, wght 100–900) | `rastikerdar/vazirmatn` @ `v33.003` — `fonts/webfonts/Vazirmatn[wght].woff2` |
| `noto-sans-arabic-var.woff2` | Noto Sans Arabic (variable, wght 100–900) | `@fontsource` `noto-sans-arabic:vf@5.2.10` `arabic-wght-normal.woff2` (byte-identical to Google `gstatic` v33) |
| `ibm-plex-mono-400/500/600.woff2` | IBM Plex Mono (static, Latin) | `@fontsource/ibm-plex-mono@5.2.7` `ibm-plex-mono-latin-{400,500,600}-normal.woff2` |

- **Vazirmatn** © Saber Rastikerdar — OFL-1.1.
- **Noto Sans Arabic** © The Noto Project Authors — OFL-1.1.
- **IBM Plex Mono** © IBM Corp. — OFL-1.1.

Full OFL-1.1 text: https://openfontlicense.org/

Coverage verified at vendor time (fontTools cmap inspection): Vazirmatn covers
Latin + Arabic + Kurdish Sorani (ڕ ڵ ۆ ێ گ ک ھ پ چ ژ ڤ) + Persian + Arabic/Persian
digits; Noto Sans Arabic covers the complete Arabic block (incl. Supplement +
Presentation Forms) as the Arabic/Kurdish fallback.
