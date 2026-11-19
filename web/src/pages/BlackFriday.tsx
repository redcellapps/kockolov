import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { AlertIcon, CheckIcon, ClockIcon, StoreIcon, TagIcon, TrendDown } from '../components/icons';
import { PromoCard } from '../components/PromoCard';
import { ProductImage } from '../components/SetCard';
import { Button, buttonClasses, CardSkeleton, cx, EmptyState, ErrorState, ShopDot } from '../components/ui';
import { WatchButton } from '../components/WatchButton';
import { t, tn } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, shopLabel } from '../lib/format';
import { usePromos } from '../lib/promos';
import { usePageTitle } from '../lib/title';

export interface BlackFridayItem {
  set_num: string;
  name: string;
  theme_name: string | null;
  image_url: string | null;
  best_price: number;
  best_shop: string;
  best_seller: string | null;
  rrp: number;
  pct: number;
  offers: number;
  min30: number | null;
  min30_at: string | null;
  real: boolean | null;
}
interface BlackFridayData {
  date: string;
  today: string;
  total: number;
  real: number;
  max_pct: number | null;
  items: BlackFridayItem[];
}

const PAGE = 24;

const GENITIVE = ['januara', 'februara', 'marta', 'aprila', 'maja', 'juna', 'jula', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];
/** "27. novembra" for a YYYY-MM-DD date (the genitive, which Intl doesn't give for Serbian) */
const dayMonth = (d: string) => {
  const [, m, day] = d.split('-').map(Number);
  return `${day}.\u00a0${GENITIVE[(m ?? 1) - 1]}`;
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/**
 * /crni-petak: every set at least 10% below its LEGO Store price today, each checked against the lowest
 * price of the last 30 days (a struck-through price is the shop's claim; the 30-day low is what the
 * set really cost). Shop promotions, how to spot a fake discount, and an invitation to watch sets.
 */
export default function BlackFridayPage() {
  usePageTitle(t('title.blackFriday'));
  const { user, registrationOpen } = useAuth();
  const q = useQuery({ queryKey: ['crni-petak'], queryFn: () => api<BlackFridayData>('/api/crni-petak') });
  const promos = usePromos().data?.items ?? [];
  const [onlyReal, setOnlyReal] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const d = q.data;
  const items = (d?.items ?? []).filter((i) => !onlyReal || i.real);
  const left = d ? daysBetween(d.today, d.date) : null;

  // the spotlight: the biggest discount that is really the lowest price of the month (the list is by discount)
  const top = d?.items.find((i) => i.real) ?? d?.items[0];
  const showReal = () => {
    setOnlyReal(true);
    setShown(PAGE);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('popusti')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="pb-10">
      {/* hero: black in light and dark theme, it's Black Friday */}
      <section aria-labelledby="bf-title" className="bf-hero relative isolate overflow-hidden">
        <div className="bf-field absolute inset-0 -z-10 hidden lg:block" aria-hidden />
        <div className="mx-auto grid max-w-7xl gap-9 px-4 pb-10 pt-9 sm:px-6 sm:pb-14 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_370px] lg:items-center lg:gap-12 lg:pb-16 lg:pt-16">
          <div className="min-w-0">
            {left != null && (
              <p className="flex items-center gap-2 text-sm font-bold text-brand sm:text-base">
                <ClockIcon size={17} className="shrink-0" />
                {left > 0 ? tn('bf.when', left, { date: dayMonth(d!.date) }) : left === 0 ? t('bf.today') : t('bf.past', { date: dayMonth(d!.date) })}
              </p>
            )}
            <h1 id="bf-title" className="mt-4 text-balance text-[2.5rem] font-extrabold leading-[0.96] tracking-[-0.035em] sm:text-6xl lg:text-[5.25rem]">
              {t('bf.title')}
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base text-white/70 sm:text-lg">{t('bf.lead')}</p>

            {d && d.total > 0 && (
              <div className="mt-8 max-w-2xl sm:mt-10">
                <StudMeter real={d.real} total={d.total} />
                <p className="mt-4 text-pretty text-[15px] font-semibold leading-snug sm:text-base">
                  {t('bf.check', { real: d.real.toLocaleString('sr-RS'), total: d.total.toLocaleString('sr-RS') })}
                </p>
                <p className="mt-1.5 text-sm text-white/60">{t('bf.check.rest')}</p>
                {d.real > 0 && (
                  <button
                    type="button"
                    onClick={showReal}
                    className="mt-5 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-brand/45 px-4 text-sm font-bold text-brand transition hover:border-brand hover:bg-brand hover:text-brand-ink"
                  >
                    <CheckIcon size={16} />
                    {t('bf.check.show')}
                  </button>
                )}
              </div>
            )}
          </div>

          {top && <Spotlight i={top} />}
        </div>
      </section>

      <section id="popusti" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">{t('bf.list.title')}</h2>
            <p className="mt-1 max-w-2xl text-ink-2">{t('bf.list.subtitle')}</p>
          </div>
          <div role="group" aria-label={t('bf.filter.label')} className="inline-flex rounded-full border border-line bg-surface p-1 text-sm font-bold">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={onlyReal === v}
                onClick={() => {
                  setOnlyReal(v);
                  setShown(PAGE);
                }}
                className={cx('inline-flex cursor-pointer items-baseline gap-1.5 rounded-full px-3.5 py-1.5', onlyReal === v ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}
              >
                {v ? t('bf.filter.real') : t('bf.filter.all')}
                {d && <span className="tabular text-xs font-semibold opacity-60">{(v ? d.real : d.total).toLocaleString('sr-RS')}</span>}
              </button>
            ))}
          </div>
        </div>

        {q.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title={t('bf.empty.title')} text={t('bf.empty.text')} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.slice(0, shown).map((i) => (
                <BlackFridayCard key={i.set_num} i={i} />
              ))}
            </div>
            {items.length > shown && (
              <div className="mt-8 flex justify-center">
                <Button variant="outline" size="lg" onClick={() => setShown((n) => n + PAGE)}>
                  {t('results.more')}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {promos.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
          <h2 className="text-2xl font-extrabold tracking-tight">{t('bf.promos.title')}</h2>
          <p className="mb-5 mt-1 max-w-2xl text-ink-2">{t('bf.promos.subtitle')}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {promos.map((p) => (
              <PromoCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
        <h2 className="text-2xl font-extrabold tracking-tight">{t('bf.tips.title')}</h2>
        {/* one panel, three checks: the struck-through price, the price history, the LEGO Store price */}
        <div className="mt-5 grid divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-3 md:divide-x md:divide-y-0">
          {([
            [1, TagIcon],
            [2, TrendDown],
            [3, StoreIcon],
          ] as const).map(([n, Icon]) => (
            <div key={n} className="p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-brand-ink">
                <Icon size={20} />
              </span>
              <h3 className="mt-4 text-lg font-extrabold">{t(`bf.tip${n}.title`)}</h3>
              <p className="mt-1 text-pretty text-ink-2">{t(`bf.tip${n}.text`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-brand p-6 text-brand-ink sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">{t('bf.cta.title')}</h2>
            <p className="mt-1 max-w-xl">{user ? t('bf.cta.textUser') : t('bf.cta.text')}</p>
          </div>
          {user ? (
            <Link to="/pracenje" className={buttonClasses('dark', 'lg', 'shrink-0')}>
              {t('bf.cta.watchlist')}
            </Link>
          ) : (
            <Link to={registrationOpen ? '/registracija' : '/prijava'} className={buttonClasses('dark', 'lg', 'shrink-0')}>
              {registrationOpen ? t('accountCta.register') : t('accountCta.login')}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

const STUDS = 20;

/**
 * How many of today's discounts are real, as a 1×20 LEGO plate: each stud is a twentieth of the discounts,
 * the yellow ones are prices that really are the lowest of the last 30 days. They light up once, on load.
 */
function StudMeter({ real, total }: { real: number; total: number }) {
  const on = real > 0 ? Math.max(1, Math.round((real / total) * STUDS)) : 0;
  return (
    <div className="bf-plate grid grid-cols-20 gap-[3px] rounded-[10px] p-[5px] sm:gap-1 sm:p-1.5" aria-hidden>
      {Array.from({ length: STUDS }, (_, n) => (
        <span key={n} className="bf-stud">
          {n < on && <span className="bf-stud-on" style={{ animationDelay: `${150 + n * 45}ms` }} />}
        </span>
      ))}
    </div>
  );
}

/** The biggest discount that passes the 30-day check (or the biggest at all), on white like the shop photos */
function Spotlight({ i }: { i: BlackFridayItem }) {
  return (
    <Link
      to={`/set/${i.set_num}`}
      className="group flex overflow-hidden rounded-3xl bg-hero-paper text-hero-ink shadow-[0_28px_60px_-24px_rgba(0,0,0,0.75)] ring-1 ring-white/10 transition hover:-translate-y-0.5 lg:flex-col"
    >
      <ProductImage src={i.image_url} alt={i.name} className="w-32 shrink-0 sm:w-44 lg:aspect-[4/3] lg:w-full" />
      <div className="flex min-w-0 flex-1 flex-col justify-center border-l border-hero-line p-4 sm:p-5 lg:border-l-0 lg:border-t">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-bold text-hero-muted">{i.real ? t('bf.top.real') : t('bf.top.any')}</p>
          <span className="rounded-lg bg-hero-red px-2 py-1 text-[13px] font-extrabold leading-none text-white">−{i.pct}%</span>
        </div>
        <h2 className="mt-2 line-clamp-2 text-[15px] font-bold leading-snug sm:text-base">{i.name}</h2>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="tabular whitespace-nowrap text-2xl font-extrabold tracking-tight text-hero-red">{money(i.best_price)}</span>
          <span className="tabular whitespace-nowrap text-[13px] text-hero-muted line-through" title={t('bf.rrp')}>
            {money(i.rrp)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[13px] text-hero-muted">
          <ShopDot shop={i.best_shop} />
          <span className="truncate">{shopLabel(i.best_shop, i.best_seller)}</span>
        </div>
        {i.real && (
          <p className="mt-3 hidden items-center gap-1.5 text-[13px] font-semibold text-hero-green sm:flex">
            <CheckIcon size={15} className="shrink-0" />
            {t('bf.real')}
          </p>
        )}
      </div>
    </Link>
  );
}

function BlackFridayCard({ i }: { i: BlackFridayItem }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link to={`/set/${i.set_num}`} className="flex flex-1 flex-col">
        <div className="relative">
          <span className="absolute bottom-3 left-3 z-10 rounded-lg bg-deal px-2 py-1 text-[13px] font-extrabold leading-none text-white">−{i.pct}%</span>
          <ProductImage src={i.image_url} alt={i.name} className="aspect-[4/3]" />
        </div>
        <div className="flex flex-1 flex-col border-t border-line p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
            <span className="tabular">{i.set_num}</span>
            {i.theme_name && (
              <>
                <span>·</span>
                <span className="truncate">{i.theme_name}</span>
              </>
            )}
          </div>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug">{i.name}</h3>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className="tabular whitespace-nowrap text-xl font-extrabold tracking-tight text-deal sm:text-2xl">{money(i.best_price)}</span>
            <span className="tabular whitespace-nowrap text-[13px] text-ink-3 line-through" title={t('bf.rrp')}>
              {money(i.rrp)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-2">
            <ShopDot shop={i.best_shop} />
            <span className="truncate">{shopLabel(i.best_shop, i.best_seller)}</span>
          </div>
          {i.real != null && (
            <div className="mt-3 border-t border-dashed border-line pt-3">
              {i.real ? (
                <p className="flex items-start gap-1.5 text-[13px] font-semibold text-save">
                  <CheckIcon size={15} className="mt-0.5 shrink-0" />
                  <span>{t('bf.real')}</span>
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-[13px] font-semibold text-ink-2">
                  <AlertIcon size={15} className="mt-0.5 shrink-0 text-deal" />
                  <span>{t('bf.notReal', { price: money(i.min30), date: dayMonth(i.min30_at!) })}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </Link>
      <WatchButton setNum={i.set_num} compact className="absolute right-3 top-3 z-10" />
    </div>
  );
}
