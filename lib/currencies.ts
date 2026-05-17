// PRD §3.1 (Design tab) — the 18 currencies the dropdown must offer.
// Order: IQD first (primary market), then alphabetical by code.

export const SUPPORTED_CURRENCIES = [
  { code: 'IQD', label_ar: 'دينار عراقي' },
  { code: 'USD', label_ar: 'دولار أمريكي' },
  { code: 'EUR', label_ar: 'يورو' },
  { code: 'SAR', label_ar: 'ريال سعودي' },
  { code: 'AED', label_ar: 'درهم إماراتي' },
  { code: 'EGP', label_ar: 'جنيه مصري' },
  { code: 'KWD', label_ar: 'دينار كويتي' },
  { code: 'QAR', label_ar: 'ريال قطري' },
  { code: 'BHD', label_ar: 'دينار بحريني' },
  { code: 'OMR', label_ar: 'ريال عُماني' },
  { code: 'JOD', label_ar: 'دينار أردني' },
  { code: 'LBP', label_ar: 'ليرة لبنانية' },
  { code: 'SYP', label_ar: 'ليرة سورية' },
  { code: 'MAD', label_ar: 'درهم مغربي' },
  { code: 'TND', label_ar: 'دينار تونسي' },
  { code: 'DZD', label_ar: 'دينار جزائري' },
  { code: 'LYD', label_ar: 'دينار ليبي' },
  { code: 'YER', label_ar: 'ريال يمني' },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code'];

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as readonly string[];

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return CURRENCY_CODES.includes(code);
}

export function currencyLabel(code: string): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.label_ar ?? code;
}
