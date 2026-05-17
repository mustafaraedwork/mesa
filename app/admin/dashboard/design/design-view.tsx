'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { saveDesign } from './actions';
import { SUPPORTED_CURRENCIES, currencyLabel } from '@/lib/currencies';
import { QrSection } from './qr-section';

export type DesignInitial = {
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  background_color: string;
  currency: string;
};

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
  const [currency, setCurrency] = useState(initial.currency);
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

  const dirty =
    displayName !== initial.display_name ||
    primary !== initial.primary_color ||
    background !== initial.background_color ||
    currency !== initial.currency ||
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
    fd.set('currency', currency);
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
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">التصميم</h2>
        <p className="text-muted-foreground text-xs">المعاينة تتحدّث فورياً — الحفظ يطبّق على الزبون.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">المعلومات الأساسية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="اسم المطعم *">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={100}
                  required
                />
              </Field>

              <Field label="العملة">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.label_ar}
                    </option>
                  ))}
                </select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">الألوان</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <ColorField label="لون أساسي" value={primary} onChange={setPrimary} />
              <ColorField label="لون الخلفية" value={background} onChange={setBackground} />
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
                    alt=""
                    className="h-16 w-16 rounded border bg-white object-contain"
                  />
                  {initial.logo_url && !logoFile && !removeLogo && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRemoveLogo(true)}
                    >
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
                <p className="text-muted-foreground text-xs">
                  سيُزال اللوغو الحالي عند الحفظ.{' '}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => setRemoveLogo(false)}
                  >
                    تراجع
                  </button>
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  ما في لوغو — سيظهر اسم المطعم في الهيدر.
                </p>
              )}

              <Input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setLogoFile(f);
                  if (f) setRemoveLogo(false);
                }}
              />
              <p className="text-muted-foreground text-xs">ستُضغط الصورة إلى 800×800 WebP.</p>
            </CardContent>
          </Card>

          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
          {saved && !dirty && <p className="text-emerald-700 text-sm">تم الحفظ.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? '...' : 'حفظ'}
            </Button>
          </div>
        </form>

        <div className="space-y-4">
          <h3 className="text-muted-foreground text-sm font-medium">معاينة حية</h3>
          <Preview
            displayName={displayName}
            logoSrc={previewLogoSrc}
            primary={primary}
            background={background}
            currency={currency}
          />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      {children}
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
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className="text-left font-mono"
          maxLength={7}
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
  currency,
}: {
  displayName: string;
  logoSrc: string | null;
  primary: string;
  background: string;
  currency: string;
}) {
  // Fake sample data to give Mustafa a feel of how a real menu card will read.
  const sample = { name: 'برغر لحم', price: 8500 };
  return (
    <div
      className="overflow-hidden rounded-xl border shadow-sm"
      style={{ background }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: primary, color: '#fff' }}
      >
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt=""
            className="h-10 w-10 rounded bg-white object-contain p-0.5"
          />
        ) : (
          <div className="bg-white/15 flex h-10 w-10 items-center justify-center rounded text-base font-bold">
            {displayName.slice(0, 1) || 'م'}
          </div>
        )}
        <div className="flex-1 truncate font-semibold">{displayName || 'اسم المطعم'}</div>
        <div className="text-xs opacity-80">AR · EN · KU</div>
      </div>

      <div className="space-y-3 p-4">
        <div className="text-sm font-semibold" style={{ color: primary }}>
          ☕ مشروبات باردة
        </div>
        <div className="bg-card flex items-center gap-3 rounded-lg border p-3">
          <div
            className="h-14 w-14 shrink-0 rounded"
            style={{ background: primary, opacity: 0.15 }}
            aria-hidden
          />
          <div className="flex-1">
            <div className="font-medium">{sample.name}</div>
            <div className="text-muted-foreground text-xs">⏱ ٥ د</div>
          </div>
          <div className="text-sm font-bold" style={{ color: primary }}>
            {sample.price.toLocaleString('en-US')} {currencyLabel(currency).split(' ')[0]}
          </div>
        </div>
        <div
          className="rounded-full px-4 py-2 text-center text-sm font-medium text-white shadow"
          style={{ background: primary }}
        >
          🛒 طلبي (٠)
        </div>
      </div>
    </div>
  );
}
