// Diner-side language helpers. PRD §3.2: name_ar is required and used as
// fallback when the selected language is missing for a given item.

export type Lang = 'ar' | 'en' | 'ku';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ar', label: 'عربي' },
  { code: 'en', label: 'EN' },
  { code: 'ku', label: 'کوردی' },
];

export function pickName(
  item: { name_ar: string; name_en: string | null; name_ku: string | null },
  lang: Lang,
): string {
  if (lang === 'en' && item.name_en) return item.name_en;
  if (lang === 'ku' && item.name_ku) return item.name_ku;
  return item.name_ar;
}

export function isRtl(lang: Lang): boolean {
  return lang === 'ar' || lang === 'ku';
}

const STRINGS = {
  ar: {
    cart_button: 'طلبي',
    cart_empty: 'سلتك فارغة.',
    cart_total: 'المجموع',
    suggestions: 'اقتراحات',
    read_to_waiter: 'اطلب من الكابتن',
    read_to_waiter_help: 'اعرض الشاشة للنادل أو اقرأها بصوت واضح.',
    back_to_menu: 'العودة للمنيو',
    unavailable: 'غير متوفر',
    no_menu: 'ما في منيو بعد.',
    closed_title: 'هذا المنيو غير متوفر حالياً',
    closed_subtitle: 'يرجى مراجعة المطعم.',
    qty_increase: '+',
    qty_decrease: '–',
    remove: 'حذف',
    prep_unit: 'د',
    today_offers: 'عروض اليوم',
    closing_active: 'عرض إغلاق',
    discount_off: 'خصم',
    add: 'إضافة',
    in_cart: 'في السلة',
  },
  en: {
    cart_button: 'My order',
    cart_empty: 'Your cart is empty.',
    cart_total: 'Total',
    suggestions: 'Suggestions',
    read_to_waiter: 'Order from the captain',
    read_to_waiter_help: 'Show this to the waiter or read it aloud.',
    back_to_menu: 'Back to menu',
    unavailable: 'Unavailable',
    no_menu: 'No menu items yet.',
    closed_title: 'This menu is not available right now',
    closed_subtitle: 'Please contact the restaurant.',
    qty_increase: '+',
    qty_decrease: '–',
    remove: 'Remove',
    prep_unit: 'min',
    today_offers: "Today's deals",
    closing_active: 'Closing offer',
    discount_off: 'OFF',
    add: 'Add',
    in_cart: 'In cart',
  },
  ku: {
    cart_button: 'فەرمایشم',
    cart_empty: 'سەبەتەکەت بەتاڵە.',
    cart_total: 'کۆ',
    suggestions: 'پێشنیار',
    read_to_waiter: 'داواکاری لە کاپتن',
    read_to_waiter_help: 'پیشانی گەرسۆنەکە بدە یان بەدەنگی بەرز بیخوێنەوە.',
    back_to_menu: 'گەڕانەوە بۆ منو',
    unavailable: 'بەردەست نییە',
    no_menu: 'هیچ خۆراکێک نییە.',
    closed_title: 'ئەم منوە لە ئێستادا بەردەست نییە',
    closed_subtitle: 'تکایە پەیوەندی بە چێشتخانەکەوە بکە.',
    qty_increase: '+',
    qty_decrease: '–',
    remove: 'سڕینەوە',
    prep_unit: 'خ',
    today_offers: 'ئەمڕۆ تەنزیلات',
    closing_active: 'تەنزیلاتی داخستن',
    discount_off: 'تەنزیلات',
    add: 'زیادکردن',
    in_cart: 'لە سەبەتەدا',
  },
} as const;

export type LabelKey = keyof typeof STRINGS.ar;

export function t(key: LabelKey, lang: Lang): string {
  return STRINGS[lang][key];
}
