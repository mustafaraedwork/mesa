'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, Coffee, ImagePlus, ShoppingCart, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { contrastRatio, readableTextOn } from '@/lib/contrast';
import { saveDesign } from './actions';
import { SUPPORTED_CURRENCIES, currencyLabel } from '@/lib/currencies';
import { QrSection } from './qr-section';

export type DesignInitial = {
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  background_color: string;
  header_color: string;
  card_color: string;
  text_color: string;
  currency: string;
  show_unavailable_items: boolean;
};

type Palette = {
  primary: string;
  background: string;
  header: string;
  card: string;
  text: string;
};

// Curated, contrast-safe palettes the owner can apply in one tap (F7) — a
// guard against hand-mixing an unreadable menu.
const PRESETS: { name: string; palette: Palette }[] = [
  { name: 'نبيذي دافئ', palette: { primary: '#8b1a1a', background: '#faf7f2', header: '#8b1a1a', card: '#ffffff', text: '#1f1410' } },
  { name: 'زمرّدي', palette: { primary: '#0f766e', background: '#f5faf8', header: '#0f5f59', card: '#ffffff', text: '#13211e' } },
  { name: 'أزرق ملكي', palette: { primary: '#1d4ed8', background: '#f5f8fd', header: '#1e3a8a', card: '#ffffff', text: '#111827' } },
  { name: 'فحمي وكهرماني', palette: { primary: '#b45309', background: '#fafaf9', header: '#1c1917', card: '#ffffff', text: '#1c1917' } },
  { name: 'توتي', palette: { primary: '#be185d', background: '#fdf6f8', header: '#9d174d', card: '#ffffff', text: '#1f1115' } },
];

export function DesignView({
  initial,
  slug,
  menuUrl,
}: {
  initial: DesignInitial;
  slug: string;
  menuUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Live form state — drives both the preview and the server save.
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [primary, setPrimary] = useState(initial.primary_color);
  const [background, setBackground] = useState(initial.background_color);
  const [header, setHeader] = useState(initial.header_color);
  const [card, setCard] = useState(initial.card_color);
  const [text, setText] = useState(initial.text_color);
  const [currency, setCurrency] = useState(initial.currency);
  const [showUnavailable, setShowUnavailable] = useState(initial.show_unavailable_items);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Local preview URL for a freshly-picked file (revoked on cleanup).
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!logoFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL lifecycle is inherently effectful
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  function applyPreset(p: Palette) {
    setPrimary(p.primary);
    setBackground(p.background);
    setHeader(p.header);
    setCard(p.card);
    setText(p.text);
  }

  const currencyItems = useMemo(
    () => Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c.code, `${c.code} — ${c.label_ar}`])),
    [],
  );

  // Live readability guards (C5). Non-blocking warnings — the owner can still
  // save, but we flag combinations that fail WCAG AA.
  const checks = [
    { label: 'الخط على الخلفية', ratio: contrastRatio(text, background), min: 4.5 },
    { label: 'الخط على بطاقة الصنف', ratio: contrastRatio(text, card), min: 4.5 },
    { label: 'اللون الأساسي على البطاقة', ratio: contrastRatio(primary, card), min: 3 },
  ];
  const hasContrastWarning = checks.some((c) => c.ratio !== null && c.ratio < c.min);

  const dirty =
    displayName !== initial.display_name ||
    primary !== initial.primary_color ||
    background !== initial.background_color ||
    header !== initial.header_color ||
    card !== initial.card_color ||
    text !== initial.text_color ||
    currency !== initial.currency ||
    showUnavailable !== initial.show_unavailable_items ||
    logoFile !== null ||
    removeLogo;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set('display_name', displayName);
    fd.set('primary_color', primary);
    fd.set('background_color', background);
    fd.set('header_color', header);
    fd.set('card_color', card);
    fd.set('text_color', text);
    fd.set('currency', currency);
    fd.set('show_unavailable_items', showUnavailable ? 'true' : 'false');
    if (logoFile) fd.set('logo', logoFile);
    if (removeLogo) fd.set('remove_logo', 'true');
    startTransition(async () => {
      const r = await saveDesign(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // After save, the server has the new state — clear pending file mutations
      // and let the router refresh pull the canonical values.
      setLogoFile(null);
      setRemoveLogo(false);
      if (fileRef.current) fileRef.current.value = '';
      setSaved(true);
      router.refresh();
    });
  }

  // What the live preview should show for the logo: the freshly-picked
  // file (if any), else the saved one (unless the user clicked remove).
  const previewLogoSrc = logoPreview ?? (removeLogo ? null : initial.logo_url);

  return (
    <div className="space-y-section">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-h2 font-semibold">التصميم</h2>
        <p className="text-muted-foreground text-caption">المعاينة فورية — الحفظ يطبّق على الزبون.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">المعلومات الأساسية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="اسم المطعم" required>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={100}
                  required
                />
              </Field>

              <Field label="العملة">
                <Select
                  value={currency}
                  onValueChange={(v) => v && setCurrency(v)}
                  items={currencyItems}
                >
                  <SelectTrigger />
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} — {c.label_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">الألوان</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-muted-foreground text-caption font-medium">لوحات جاهزة</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p.palette)}
                      className="border-border-strong hover:bg-muted flex items-center gap-2 rounded-full border py-1 ps-1 pe-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex" aria-hidden>
                        <span className="border-card size-5 rounded-full border-2" style={{ background: p.palette.primary }} />
                        <span className="border-card -ms-2 size-5 rounded-full border-2" style={{ background: p.palette.header }} />
                        <span className="border-card -ms-2 size-5 rounded-full border-2" style={{ background: p.palette.background }} />
                      </span>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ColorField label="لون أساسي" value={primary} onChange={setPrimary} />
                <ColorField label="لون الخلفية" value={background} onChange={setBackground} />
                <ColorField label="لون الهيدر" value={header} onChange={setHeader} />
                <ColorField label="لون بطاقة الصنف" value={card} onChange={setCard} />
                <ColorField label="لون الخط" value={text} onChange={setText} />
              </div>

              <ContrastReport checks={checks} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">اللوغو</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {previewLogoSrc ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewLogoSrc}
                    alt="شعار المطعم"
                    className="size-16 rounded-lg border bg-white object-contain"
                  />
                  {initial.logo_url && !logoFile && !removeLogo && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setRemoveLogo(true)}>
                      إزالة
                    </Button>
                  )}
                  {logoFile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLogoFile(null);
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                    >
                      تراجع عن الاختيار
                    </Button>
                  )}
                </div>
              ) : removeLogo ? (
                <p className="text-muted-foreground text-caption">
                  سيُزال اللوغو الحالي عند الحفظ.{' '}
                  <button type="button" className="text-primary underline" onClick={() => setRemoveLogo(false)}>
                    تراجع
                  </button>
                </p>
              ) : (
                <p className="text-muted-foreground text-caption">
                  ما في لوغو — سيظهر اسم المطعم في الهيدر.
                </p>
              )}

              <label className="border-border-strong text-muted-foreground hover:bg-muted flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/60">
                <ImagePlus className="size-4 shrink-0" aria-hidden />
                <span>اختر شعاراً…</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setLogoFile(f);
                    if (f) setRemoveLogo(false);
                  }}
                />
              </label>
              <p className="text-muted-foreground text-caption">ستُضغط الصورة إلى 800×800 WebP.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">إعدادات المنيو</CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span>إظهار الأصناف غير المتوفرة في منيو الزبون (تظهر رمادية ومعلّمة)</span>
                <Switch
                  checked={showUnavailable}
                  onCheckedChange={setShowUnavailable}
                  aria-label="إظهار الأصناف غير المتوفرة"
                />
              </label>
            </CardContent>
          </Card>

          {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
          {saved && !dirty && <p className="text-success-text text-sm">تم الحفظ.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? '...' : 'حفظ'}
            </Button>
          </div>
        </form>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <h3 className="text-muted-foreground text-sm font-medium">معاينة حية</h3>
          <Preview
            displayName={displayName}
            logoSrc={previewLogoSrc}
            primary={primary}
            background={background}
            header={header}
            card={card}
            text={text}
            currency={currency}
          />
          {hasContrastWarning && (
            <p className="text-warning-text bg-warning/10 flex items-start gap-2 rounded-lg p-2.5 text-caption">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              بعض الألوان قد تكون صعبة القراءة — راجع مؤشّرات التباين أو اختر لوحة جاهزة.
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">رابط المنيو والـQR</CardTitle>
        </CardHeader>
        <CardContent>
          <QrSection menuUrl={menuUrl} slug={slug} />
        </CardContent>
      </Card>
    </div>
  );
}

function ContrastReport({
  checks,
}: {
  checks: { label: string; ratio: number | null; min: number }[];
}) {
  return (
    <div className="border-border-lite space-y-1.5 rounded-lg border p-3">
      <p className="text-caption font-medium">قابلية القراءة (WCAG AA)</p>
      {checks.map((c) => {
        const pass = c.ratio !== null && c.ratio >= c.min;
        return (
          <div key={c.label} className="flex items-center justify-between gap-2 text-caption">
            <span className="text-muted-foreground">{c.label}</span>
            <span className="flex items-center gap-1.5">
              <span dir="ltr" className="font-mono tabular-nums">
                {c.ratio === null ? '—' : `${c.ratio.toFixed(1)}:1`}
              </span>
              <Badge variant={pass ? 'success' : 'destructive'}>
                {pass ? <Check className="size-3" /> : <TriangleAlert className="size-3" />}
                {pass ? 'جيّد' : 'منخفض'}
              </Badge>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <span className="border-border-strong relative size-11 shrink-0 overflow-hidden rounded-lg border">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -inset-1 size-[calc(100%+0.5rem)] cursor-pointer"
            aria-label={label}
          />
        </span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className="text-left font-mono uppercase"
          maxLength={7}
          aria-label={`${label} (HEX)`}
        />
      </div>
    </div>
  );
}

function Preview({
  displayName,
  logoSrc,
  primary,
  background,
  header,
  card,
  text,
  currency,
}: {
  displayName: string;
  logoSrc: string | null;
  primary: string;
  background: string;
  header: string;
  card: string;
  text: string;
  currency: string;
}) {
  // Fake sample data to give Mustafa a feel of how a real menu card will read.
  const sample = { name: 'برغر لحم', price: 8500 };
  const headerInk = readableTextOn(header);
  const onPrimary = readableTextOn(primary);
  return (
    <div className="overflow-hidden rounded-xl border shadow-card" style={{ background, color: text }}>
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: header, color: headerInk }}>
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt="شعار المطعم"
            className="size-10 rounded-lg bg-white object-contain p-0.5"
          />
        ) : (
          <div
            className="flex size-10 items-center justify-center rounded-full text-base font-bold"
            style={{ background: `${onPrimary === '#ffffff' ? primary : '#ffffff'}22`, color: headerInk }}
          >
            {displayName.slice(0, 1) || 'م'}
          </div>
        )}
        <div className="flex-1 truncate font-semibold">{displayName || 'اسم المطعم'}</div>
        <div className="text-caption opacity-70">AR · EN · KU</div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: primary }}>
          <Coffee className="size-4" aria-hidden />
          مشروبات باردة
        </div>
        <div className="flex items-center gap-3 rounded-lg border p-3" style={{ background: card }}>
          <div className="size-14 shrink-0 rounded-md" style={{ background: primary, opacity: 0.15 }} aria-hidden />
          <div className="flex-1">
            <div className="font-medium">{sample.name}</div>
            <div className="flex items-center gap-1 text-caption opacity-60">
              <Clock className="size-3" aria-hidden />
              ٥ د
            </div>
          </div>
          <div className="font-mono text-sm font-bold tabular-nums" style={{ color: primary }}>
            {sample.price.toLocaleString('en-US')} {currencyLabel(currency).split(' ')[0]}
          </div>
        </div>
        <div
          className="flex items-center justify-center gap-2 rounded-full px-4 py-2 text-center text-sm font-medium shadow-card"
          style={{ background: primary, color: onPrimary }}
        >
          <ShoppingCart className="size-4" aria-hidden />
          طلبي (٠)
        </div>
      </div>
    </div>
  );
}
