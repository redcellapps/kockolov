import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { AlertIcon, CheckIcon, ClockIcon, TagIcon } from '../components/icons';
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

  return (
    <div className="pb-10">
      {/* hero: black, it's Black Friday */}
      <section className="bg-ink text-bg">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-ink">
            <TagIcon size={13} /> {t('bf.badge', { date: dayMonth(d?.date ?? '2026-11-27') })}
          </p>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">{t('bf.title')}</h1>
          <p className="mt-4 max-w-2xl text-pretty text-bg/75 sm:text-lg">{t('bf.lead')}</p>
          {left != null && (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-bg/20 px-3.5 py-1.5 text-sm font-bold">
              <ClockIcon size={16} />
              {left > 0 ? tn('bf.countdown', left) : left === 0 ? t('bf.today') : t('bf.past', { date: dayMonth(d!.date) })}
            </p>
          )}
          {d && d.total > 0 && (
            <dl className="mt-7 grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
              <Fact n={d.total} label={tn('bf.stat.total', d.total)} />
              <Fact n={d.real} label={t('bf.stat.real')} />
              {d.max_pct != null && <Fact n={`−${d.max_pct}%`} label={t('bf.stat.max')} />}
            </dl>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10">
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
                className={cx('cursor-pointer rounded-full px-3.5 py-1.5', onlyReal === v ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}
              >
                {v ? t('bf.filter.real') : t('bf.filter.all')}
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
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {([1, 2, 3] as const).map((n) => (
            <div key={n} className="rounded-2xl border border-line bg-surface p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-lg font-extrabold text-brand-ink">{n}</span>
              <h3 className="mt-4 text-lg font-extrabold">{t(`bf.tip${n}.title`)}</h3>
              <p className="mt-1 text-ink-2">{t(`bf.tip${n}.text`)}</p>
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

function Fact({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="flex flex-col-reverse justify-end rounded-2xl border border-bg/15 bg-bg/[0.06] px-3 py-2.5 sm:px-4 sm:py-3">
      <dt className="text-xs leading-snug text-bg/70 sm:text-sm">{label}</dt>
      <dd className="tabular text-xl font-extrabold leading-tight sm:text-2xl">{n}</dd>
    </div>
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
