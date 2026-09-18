import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import './landing.css';
import { Faq, Reveal, type FaqItem } from './landing-client';

// biziii.io root — the marketing landing page. Ported 1:1 from
// landing_page/BIZIII Menu Landing (1).html; copy and layout are the
// design's, not ours. All six phone frames show real screenshots of the live
// product (public/landing/*.webp).

export const metadata: Metadata = {
  title: 'BIZIII Menu — ليش تغيّر المنيو الخاص بك؟',
  description:
    'منيو رقمي لأصحاب المطاعم والكافيهات في العراق: يوجّه الزبون، يقترح عليه، يبرز الأصناف الي تريد تبيعها، ويساعدك تتخلص من الأصناف المعرّضة للتلف.',
};

// Every CTA on the page opens the same WhatsApp conversation with the owner
// (+964 784 566 3136). NEXT_PUBLIC_WHATSAPP_NUMBER overrides it per deployment.
const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, '') || '9647845663136';
const CONTACT_HREF = `https://wa.me/${WHATSAPP_NUMBER}`;

const CTA_TRY = 'جرّب المنيو الخاص بك';
const CTA_TRY_OURS = 'جرّب المنيو الخاص بك على نظامنا';
const CTA_TRY_NOW = 'جرّب المنيو الخاص بك الآن';
const NO_RESTART = 'لا تحتاج تبدأ من الصفر · النقل مجاني · جاهز باچر';

const FAQ: FaqItem[] = [
  { q: 'عندي منيو على نظام ثاني، أكدر أنقله؟', a: 'نعم، وننقله مجاناً خلال 24 ساعة.' },
  { q: 'الزبون يحتاج ينزل تطبيق؟', a: 'لا، يصور الـQR ويفتح المنيو بالمتصفح.' },
  { q: 'إذا ما عجبني؟', a: 'ما تدفع. تشوف المنيو جاهز أول، وبعدين تقرر.' },
  { q: 'أكدر أعدل الأسعار بنفسي؟', a: 'نعم من موبايلك، والتعديل يظهر للزبون بثواني.' },
  { q: 'عندي أكثر من فرع؟', a: 'راسلنا، نرتبها لك.' },
  {
    q: 'أكدر أدير كل شي بنفسي؟',
    a: 'نعم، من صفحة الإدارة الخاصة بمطعمك على موبايلك. وإذا انشغلت، ابعثلنا التعديل ونسويه.',
  },
];

const STEPS = [
  ['١', 'الزبون يدخل'],
  ['٢', 'يشوف الأصناف الي تريد تبرزها'],
  ['٣', 'يختار المنتج'],
  ['٤', 'يشوف الاقتراحات'],
  ['٥', 'يضيف الإضافات'],
  ['٦', 'يرتفع متوسط الطلب'],
] as const;

const COMPARE: [string, string][] = [
  ['يعرض المنتجات', 'يساعدك تبيع المنتجات'],
  ['أسعار ثابتة', 'أوضاع بيع مختلفة'],
  ['الزبون يختار وحده', 'اقتراحات لكل منتج'],
  ['ما تعرف شنو جذب الانتباه', 'تحليلات لكل صنف'],
  ['الصنف المعرّض للتلف يبقى مثل ما هو', 'خصم الإغلاق'],
  ['منيو ثابت', 'منيو تتحكم بيه'],
  ['مجرد عرض', 'أداة مبيعات'],
];

const PLAN_FEATURES = [
  'الأوضاع',
  'التحليلات',
  'الاقتراحات',
  'صفحة إدارة خاصة بمطعمك',
  'ثلاث لغات',
  'نقل المنيو مجاناً',
  'QR جاهز للطباعة',
];

// ── phone frame + mock screens ──────────────────────────────────────────

function Phone({
  size,
  tilt,
  children,
}: {
  size: 'sm' | 'lg';
  tilt?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`lp-phone lp-phone--${size}${tilt ? ' lp-phone--tilt' : ''}`} aria-hidden="true">
      <div className="lp-phone__screen">
        <div className="lp-phone__notch" />
        {children}
      </div>
    </div>
  );
}

// A real screenshot of the live product (390×836 CSS px, captured at 2×),
// pinned to the top of the frame under a status-bar strip in the page's own
// header colour so the notch reads like a phone, not a crop.
function Screen({ src, bar }: { src: string; bar: 'light' | 'dark' }) {
  return (
    <div className={`lp-screen lp-screen--${bar}`}>
      <Image src={src} alt="" width={780} height={1672} sizes="(min-width: 1024px) 360px, 290px" />
    </div>
  );
}

function StatsList({ title, rows }: { title: string; rows: [string, string][] }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="lp-stats__col">
      <p className="lp-stats__title">{title}</p>
      <div className="lp-stats__list">
        {rows.map(([name, num], i) => (
          <div key={name} className="lp-stats__row">
            <span className="lp-stats__medal">{medals[i]}</span>
            <span className="lp-stats__name">{name}</span>
            <span className="lp-stats__num lp-mono">{num}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.2c-5 0-9 3.4-9 7.6 0 2.4 1.3 4.5 3.3 5.9L5.5 21l4.2-2.1c.7.2 1.5.2 2.3.2 5 0 9-3.4 9-7.6s-4-8.3-9-8.3z"
        fill="currentColor"
      />
    </svg>
  );
}

// ── page ────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <main className="lp">
      <noscript>
        <style>{'.lp-reveal{opacity:1;transform:none}'}</style>
      </noscript>

      <header className="lp-nav">
        <div className="lp-nav__in">
          <a className="lp-brand" href="#top">
            BIZIII
          </a>
          <a className="lp-btn" href={CONTACT_HREF}>
            {CTA_TRY}
          </a>
        </div>
      </header>

      <section id="top" className="lp-hero">
        <div className="lp-wrap">
          <div>
            <p className="lp-eyebrow">لأصحاب المطاعم والكافيهات في العراق</p>
            <h1 className="lp-h1">ليش تغيّر المنيو الخاص بك؟</h1>
            <div className="lp-hero__lines">
              <p className="lp-body">عندك منيو بالفعل؟ ممتاز.</p>
              <p className="lp-body">بس هل المنيو الخاص بك يساعدك تبيع أكثر؟</p>
              <p className="lp-body">
                لو وظيفته بس يعرض الاسم والسعر والصورة، فأنت تستخدم منيو… مو نظام مبيعات.
              </p>
            </div>
            <div className="lp-hero__because">
              <p className="lp-hero__because-title">
                لأن هذا مو مجرد منيو.
                <br />
                هذا نظام يخلي المنيو يشتغل لصالحك:
              </p>
              <p className="lp-hero__because-text">
                يوجّه الزبون، يقترح عليه، يبرز الأصناف الي تريد تبيعها، ويساعدك تتخلص من الأصناف
                المعرّضة للتلف.
              </p>
            </div>
            <a className="lp-btn lp-btn--cta" href={CONTACT_HREF}>
              {CTA_TRY_OURS}
            </a>
            <p className="lp-note lp-hero__note">{NO_RESTART}</p>
          </div>

          <div className="lp-hero__visual">
            <Phone size="sm" tilt>
              <Screen src="/landing/menu-top.webp" bar="light" />
            </Phone>
            <div className="lp-float" aria-hidden="true">
              <div className="lp-float__head">
                <span className="lp-float__title">الأكثر تفاعلاً</span>
                <span className="lp-float__chip">مثال</span>
              </div>
              <div className="lp-float__row">
                <span className="lp-float__name">برغر كلاسيك</span>
                <span className="lp-float__num lp-mono">1,284</span>
              </div>
              <div className="lp-float__row">
                <span className="lp-float__name">زنجر</span>
                <span className="lp-float__num lp-mono">942</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Reveal className="lp-sec lp-sec--roomy lp-sells">
        <div className="lp-wrap lp-grid">
          <div>
            <p className="lp-sells__a">المنيو الحالي يعرض.</p>
            <p className="lp-sells__b">منيو BIZIII يبيع.</p>
          </div>
          <div className="lp-stage">
            <Phone size="lg">
              <Screen src="/landing/menu-grid.webp" bar="light" />
            </Phone>
          </div>
        </div>
      </Reveal>

      <Reveal className="lp-sec lp-feat">
        <div className="lp-wrap lp-grid">
          <div>
            <h2 className="lp-h2">عندك أصناف تربح بيها أكثر؟ خلّي الزبون يشوفها أول.</h2>
            <p className="lp-body">
              فعّل اختيارات الشيف وحدد الأصناف الي تريد تدفعها أكثر. النظام يبرزها داخل المنيو بشكل
              واضح حتى تزيد فرصة إن الزبون يوصل إلها ويطلبها.
            </p>
            <p className="lp-punch">مو كل الأصناف متساوية بالربح. ليش تخلي الزبون يختار عشوائياً؟</p>
          </div>
          <div className="lp-stage">
            <Phone size="sm">
              <Screen src="/landing/menu-chef.webp" bar="light" />
            </Phone>
          </div>
        </div>
      </Reveal>

      <Reveal className="lp-sec lp-feat">
        <div className="lp-wrap lp-grid lp-grid--flip">
          <div>
            <h2 className="lp-h2">بعد ساعتين تسكّر، وعندك أصناف تخاف تخرب؟</h2>
            <p className="lp-body">
              لا تنتظر حتى تصير خسارة. فعّل خصم الإغلاق، حدد الأصناف والنسبة والوقت، والنظام يبرز
              الأصناف المخفّضة بأول المنيو وينطفي لحاله لما يخلص الوقت.
            </p>
            <p className="lp-punch">بدل ما تخسر قيمة الصنف كامل، صرّفه قبل نهاية اليوم.</p>
          </div>
          <div className="lp-stage">
            <Phone size="sm">
              <Screen src="/landing/menu-closing.webp" bar="light" />
            </Phone>
          </div>
        </div>
      </Reveal>

      <Reveal className="lp-sec lp-feat lp-analytics">
        <div className="lp-wrap">
          <h2 className="lp-h2">أخيراً تعرف شنو يريد زبونك فعلاً.</h2>
          <p className="lp-body">
            مو كل شي ينكتب بالمنيو يعني الناس تريده. من صفحة التحليلات تشوف أكثر الأصناف الي ضغط
            عليها الزبائن، وأكثر المنتجات اهتماماً، وتستخدم هذي المعلومات حتى تحسّن المنيو
            والاقتراحات.
          </p>
          <div className="lp-stats" aria-hidden="true">
            <span className="lp-stats__chip">مثال</span>
            <div className="lp-stats__cols">
              <StatsList
                title="الأكثر تفاعلاً"
                rows={[
                  ['برغر كلاسيك', '1,284 فتحة'],
                  ['زنجر', '942'],
                  ['تشيكن برغر', '731'],
                ]}
              />
              <StatsList
                title="الأكثر اختياراً"
                rows={[
                  ['برغر كلاسيك', '612 اختيار'],
                  ['فنجر', '488'],
                  ['بيبسي', '401'],
                ]}
              />
            </div>
          </div>
          <p className="lp-analytics__tag">عرفت شنو يحبون؟ هسه خلّي النظام يقترحه عليهم.</p>
        </div>
      </Reveal>

      <Reveal className="lp-sec lp-sec--roomy lp-feat lp-suggest">
        <div className="lp-wrap lp-grid">
          <div>
            <h2 className="lp-h2">الزبون طلب برغر؟ لا تخليه يطلع ببرغر بس.</h2>
            <p className="lp-body">
              حدد لكل صنف الأشياء الي تريد النظام يقترحها تلقائياً. بدل ما تعتمد على إن الزبون يتذكر
              الإضافات بنفسه، النظام يحطها قدامه باللحظة المناسبة.
            </p>
            <div className="lp-uplift">
              <span className="lp-uplift__from lp-mono">7,000 د.ع</span>
              <span className="lp-uplift__arrow" aria-hidden="true">
                ←
              </span>
              <span className="lp-uplift__to lp-mono">11,000 د.ع</span>
            </div>
            <p className="lp-note lp-uplift__note">مثال على طلب واحد. مصمّم لرفع قيمة الطلب عبر الاقتراحات.</p>
          </div>
          <div className="lp-stage">
            <Phone size="lg">
              <Screen src="/landing/product-suggestions.webp" bar="dark" />
            </Phone>
          </div>
        </div>
      </Reveal>

      <Reveal className="lp-sec lp-control">
        <div className="lp-wrap lp-grid lp-grid--flip">
          <div>
            <h2 className="lp-h2">أنت تتحكم بالي ينطلب.</h2>
            <div className="lp-control__list">
              <p className="lp-control__item">
                <i className="lp-control__mark" aria-hidden="true" />
                <span>عندك صنف خلص؟ أخفيه.</span>
              </p>
              <p className="lp-control__item">
                <i className="lp-control__mark" aria-hidden="true" />
                <span>تريد تدفع صنف معين؟ برّزه.</span>
              </p>
              <p className="lp-control__item">
                <i className="lp-control__mark" aria-hidden="true" />
                <span>تريد توقف عرض؟ غيّر وضعه.</span>
              </p>
              <p className="lp-control__item">
                <i className="lp-control__mark" aria-hidden="true" />
                <span>تريد تصرّف صنف قبل الإغلاق؟ فعّل الخصم.</span>
              </p>
            </div>
            <p className="lp-control__claim">المنيو مو صفحة ثابتة. لوحة تحكم بالمبيعات، من واجهة الزبون.</p>
          </div>
          <div className="lp-control__stage">
            <Phone size="sm">
              <Screen src="/landing/admin-menu.webp" bar="light" />
            </Phone>
            <p className="lp-note lp-control__caption">صفحة إدارة خاصة بمطعمك، تنثبت كتطبيق على موبايلك.</p>
          </div>
        </div>
      </Reveal>

      <Reveal className="lp-sec lp-steps">
        <div className="lp-wrap">
          <h2 className="lp-h2">كيف يشتغل مع كل زبون</h2>
          <div className="lp-steps__flow">
            {STEPS.map(([n, t], i) => (
              <div key={n} style={{ display: 'contents' }}>
                {i > 0 && <div className="lp-step__link" aria-hidden="true" />}
                <div className={`lp-step${i === STEPS.length - 1 ? ' lp-step--last' : ''}`}>
                  <span className="lp-step__n">{n}</span>
                  <span className="lp-step__t">{t}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal className="lp-sec lp-compare">
        <div className="lp-wrap">
          <h2 className="lp-h2">إذا المنيو الحالي يسوي نص هذي الأشياء، ليش بعدك تستخدمه؟</h2>
          <div className="lp-table" role="table">
            <div className="lp-table__cell lp-table__cell--head lp-table__cell--old" role="columnheader">
              <p className="lp-table__head">المنيو التقليدي</p>
            </div>
            <div className="lp-table__cell lp-table__cell--head lp-table__cell--new" role="columnheader">
              <p className="lp-table__head">منيو BIZIII</p>
            </div>
            {COMPARE.map(([old, neu], i) => {
              const foot = i === COMPARE.length - 1 ? ' lp-table__cell--foot' : '';
              return (
                <div key={old} style={{ display: 'contents' }} role="row">
                  <div className={`lp-table__cell lp-table__cell--old${foot}`} role="cell">
                    <span className="lp-table__dash" aria-hidden="true">
                      –
                    </span>
                    <p className="lp-table__text">{old}</p>
                  </div>
                  <div className={`lp-table__cell lp-table__cell--new${foot}`} role="cell">
                    <span className="lp-table__tick" aria-hidden="true">
                      ✓
                    </span>
                    <p className="lp-table__text">{neu}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Reveal>

      <Reveal id="pricing" className="lp-sec lp-pricing">
        <div className="lp-wrap">
          <h2 className="lp-h2">حوّل المنيو الحالي لمطعمك إلى نظام مبيعات.</h2>
          <p className="lp-body">
            ابعثلنا رابط المنيو الحالي، أو PDF، أو حتى صورة من الورقي. ننقله كامل بأصنافه وأسعاره
            وصوره، وباچر يكون شغال بكل الي قرأته فوق.
          </p>
          <p className="lp-pricing__quote">&quot;عندي منيو بالفعل.&quot; — نعرف. لهذا صممناه لك.</p>
          <p className="lp-note lp-pricing__sub">لا تحتاج تبدأ من الصفر.</p>
          <div className="lp-pricing__box">
            <div className="lp-price">
              <div className="lp-price__num">
                <span className="lp-price__hi" aria-hidden="true" />
                <span className="lp-price__val lp-mono">99,000 د.ع</span>
              </div>
              <p className="lp-price__per">بالسنة · يعني أقل من 8,500 دينار بالشهر</p>
              <div className="lp-price__feats">
                {PLAN_FEATURES.map((f) => (
                  <p key={f}>
                    <span>✓</span>&nbsp; {f}
                  </p>
                ))}
              </div>
              <a className="lp-btn lp-btn--cta" href={CONTACT_HREF}>
                {CTA_TRY_NOW}
              </a>
            </div>
            <p className="lp-note lp-pricing__note">تدفع بعد ما تشوف المنيو الخاص بك جاهز وتوافق عليه.</p>
          </div>
        </div>
      </Reveal>

      <Reveal id="faq" className="lp-sec lp-faq">
        <div className="lp-wrap">
          <Faq items={FAQ} />
        </div>
      </Reveal>

      <Reveal id="contact" className="lp-sec lp-final">
        <div className="lp-wrap">
          <h2 className="lp-h2">المنيو الخاص بك شنو يسوي غير عرض السعر؟</h2>
          <p className="lp-body">ابعثه بأي شكل، ونرجع لك بمنيو يبيع قبل ما تفتح باچر.</p>
          <a className="lp-btn lp-btn--final" href={CONTACT_HREF}>
            <WhatsAppMark />
            <span>{CTA_TRY_NOW}</span>
          </a>
          <p className="lp-note">{NO_RESTART}</p>
        </div>
      </Reveal>

      <footer className="lp-sec lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot__group">
            <span className="lp-foot__brand">BIZIII</span>
            <p className="lp-foot__where">biziii.io · بغداد</p>
          </div>
          <div className="lp-foot__links">
            <a href="#pricing">الأسعار</a>
            <a href="#faq">الأسئلة</a>
            <a href="#contact">تواصل</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
