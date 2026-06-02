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

/**
 * Like `pickName`, but also returns the language the name actually resolved to.
 * When a localized name is missing we fall back to Arabic — and the span must be
 * tagged with `ar`/RTL, NOT the UI language, otherwise an Arabic fallback on the
 * EN surface renders LTR and is mispronounced by screen readers (audit H10).
 */
export function resolveName(
  item: { name_ar: string; name_en: string | null; name_ku: string | null },
  lang: Lang,
): { text: string; lang: Lang } {
  if (lang === 'en' && item.name_en) return { text: item.name_en, lang: 'en' };
  if (lang === 'ku' && item.name_ku) return { text: item.name_ku, lang: 'ku' };
  return { text: item.name_ar, lang: 'ar' };
}

export function isRtl(lang: Lang): boolean {
  return lang === 'ar' || lang === 'ku';
}

/**
 * BCP-47 tag for the html `lang`/span attribute. Our internal `ku` is Central
 * Kurdish (Sorani) in Arabic script → `ckb` so AT/font-shaping is correct
 * (audit M16). `ar`/`en` map to themselves.
 */
export function bcp47(lang: Lang): string {
  return lang === 'ku' ? 'ckb' : lang;
}

/**
 * Localized currency token + placement (audit H4). IQD shows the native «د.ع»
 * in Arabic/Kurdish and the ISO code in English. The amount is always grouped
 * with Western digits inside a dir=ltr span at the call site.
 */
export function currencyLabel(currency: string, lang: Lang): string {
  if (currency === 'IQD') return lang === 'en' ? 'IQD' : 'د.ع';
  return currency;
}

// Parse a stored/raw language value to a valid Lang, defaulting to Arabic
// (PRD §3.2 fallback). Replaces the duplicated `(... ?? 'ar') as Lang` + manual
// membership check across the diner views (Q-30).
export function parseLang(raw: string | null | undefined): Lang {
  return raw === 'en' || raw === 'ku' ? raw : 'ar';
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
    close: 'إغلاق',
    done: 'تم',
    clear_cart: 'إفراغ الطلب',
    clear_cart_confirm: 'تأكيد الإفراغ؟',
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
    greeting_morning: 'صباح الخير',
    greeting_evening: 'مساء الخير',
    welcome_tagline: 'منيو الليلة جاهز، اختر بروح الشيف وتفضّل.',
    open_menu: 'افتح المنيو',
    choose_lang: 'اختر لغتك',
    chef_tonight: 'اختيارات الشيف الليلة',
    cart_items: 'صنف في السلة',
    view_cart: 'عرض السلة',
    search_placeholder: 'ابحث عن صنف…',
    no_results: 'لا نتائج مطابقة',
    added_to_cart: 'أُضيف إلى السلة',
    offer_ends_at: 'عرض الإغلاق — ينتهي',
    menu_coming_soon: 'المنيو قيد التحضير',
  },
  en: {
    cart_button: 'My order',
    cart_empty: 'Your cart is empty.',
    cart_total: 'Total',
    suggestions: 'Suggestions',
    read_to_waiter: 'Order from the captain',
    read_to_waiter_help: 'Show this to the waiter or read it aloud.',
    back_to_menu: 'Back to menu',
    close: 'Close',
    done: 'Done',
    clear_cart: 'Clear order',
    clear_cart_confirm: 'Confirm clear?',
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
    greeting_morning: 'Good morning',
    greeting_evening: 'Good evening',
    welcome_tagline: "Tonight's menu is ready — pick what the chef loves.",
    open_menu: 'Open the menu',
    choose_lang: 'Choose your language',
    chef_tonight: "Chef's picks tonight",
    cart_items: 'item(s) in cart',
    view_cart: 'View cart',
    search_placeholder: 'Search the menu…',
    no_results: 'No matching items',
    added_to_cart: 'Added to cart',
    offer_ends_at: 'Closing offer — ends',
    menu_coming_soon: 'Menu coming soon',
  },
  ku: {
    cart_button: 'فەرمایشم',
    cart_empty: 'سەبەتەکەت بەتاڵە.',
    cart_total: 'کۆ',
    suggestions: 'پێشنیار',
    read_to_waiter: 'داواکاری لە کاپتن',
    read_to_waiter_help: 'پیشانی گەرسۆنەکە بدە یان بەدەنگی بەرز بیخوێنەوە.',
    back_to_menu: 'گەڕانەوە بۆ منو',
    close: 'داخستن',
    done: 'تەواو',
    clear_cart: 'سڕینەوەی فەرمایش',
    clear_cart_confirm: 'دڵنیای؟',
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
    greeting_morning: 'بەیانیت باش',
    greeting_evening: 'ئێوارەت باش',
    welcome_tagline: 'مینۆی ئەمشەو ئامادەیە، فەرموو هەڵبژێرە.',
    open_menu: 'مینۆ بکەرەوە',
    choose_lang: 'زمانەکەت هەڵبژێرە',
    chef_tonight: 'هەڵبژاردنی شێف بۆ ئەمشەو',
    cart_items: 'بەش لە سەبەتە',
    view_cart: 'بینینی سەبەتە',
    search_placeholder: 'گەڕان بۆ خۆراک…',
    no_results: 'هیچ ئەنجامێک نییە',
    added_to_cart: 'زیادکرا بۆ سەبەتە',
    offer_ends_at: 'تەنزیلاتی داخستن — کۆتایی',
    menu_coming_soon: 'مینۆ بەم زووانە',
  },
} as const;

export type LabelKey = keyof typeof STRINGS.ar;

export function t(key: LabelKey, lang: Lang): string {
  return STRINGS[lang][key];
}
