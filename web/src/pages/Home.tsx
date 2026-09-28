import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ChevronRight, ClockIcon, SparkIcon, StoreIcon, TagIcon } from '../components/icons';
import { SearchBox } from '../components/SearchBox';
import { DealCard, ProductImage } from '../components/SetCard';
import { ShopDot } from '../components/ui';
import { CardSkeleton, EmptyState, SectionHeader } from '../components/ui';
import { t, tn } from '../i18n';
import { api, type Deal, type Shop, type Stats, type Theme } from '../lib/api';
import { ago, num, reasonText, rsd, shopLabel, SHOPS } from '../lib/format';

const POPULAR = ['Hogvorts', 'Milenijumski soko', 'Ferrari', 'Botanicals', 'Božićni kalendar', 'Minecraft'];

export default function Home() {
  const deals = useQuery({ queryKey: ['deals', 12], queryFn: () => api<{ day: string | null; items: Deal[] }>('/api/deals?limit=12') });
  const themes = useQuery({ queryKey: ['themes'], queryFn: () => api<Theme[]>('/api/themes'), staleTime: 600_000 });
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/api/stats'), staleTime: 300_000 });
  const shops = useQuery({ queryKey: ['shops'], queryFn: () => api<Shop[]>('/api/shops'), staleTime: 600_000 });

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line bg-brand">
        <div className="studs absolute inset-0 opacity-70" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:gap-14">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand">
              <SparkIcon size={14} /> {t('app.tagline')}
            </span>
            <h1 className="mt-5 text-[34px] font-extrabold leading-[1.04] tracking-tight text-brand-ink sm:text-6xl">
              {t('home.hero.title')}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-brand-ink/80 sm:text-lg">{t('home.hero.subtitle')}</p>
            <div className="mt-7 max-w-2xl">
              <SearchBox size="lg" />
              <div className="scrollbar-none -mx-4 mt-4 flex items-center gap-2 overflow-x-auto px-4 text-sm sm:mx-0 sm:flex-wrap sm:px-0">
                <span className="shrink-0 font-semibold text-brand-ink/70">{t('home.popular')}</span>
                {POPULAR.map((p) => (
                  <Link
                    key={p}
                    to={`/pretraga?q=${encodeURIComponent(p)}`}
                    className="shrink-0 rounded-full bg-white/70 px-3 py-1 font-semibold text-brand-ink transition hover:bg-white"
                  >
                    {p}
                  </Link>
                ))}
              </div>
            </div>
            {stats.data && (
              <dl className="mt-8 flex max-w-2xl flex-wrap gap-x-6 gap-y-2 text-brand-ink">
                {[
                  [num(stats.data.sets_in_stock), t('home.stats.sets')],
                  [num(stats.data.offers_in_stock), t('home.stats.offers')],
                  [num(stats.data.shops), t('home.stats.shops')],
                  [num(stats.data.sellers), t('home.stats.sellers')],
                ].map(([v, l]) => (
                  <div key={l} className="flex items-baseline gap-1.5">
                    <dd className="tabular text-2xl font-extrabold">{v}</dd>
                    <dt className="text-sm font-semibold text-brand-ink/70">{l}</dt>
                  </div>
                ))}
              </dl>
            )}
            {stats.data?.last_update && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-ink/70">
                <ClockIcon size={16} /> {t('home.stats.updated', { when: ago(stats.data.last_update) })}
              </p>
            )}
          </div>
          {deals.data?.items[0] && <TopDeal d={deals.data.items[0]} />}
        </div>
      </section>

      {/* Deals */}
      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16">
        <SectionHeader
          title={t('home.deals.title')}
          subtitle={t('home.deals.subtitle')}
          action={
            <Link to="/ponude" className="hidden shrink-0 items-center gap-1 text-sm font-bold text-accent hover:underline sm:inline-flex">
              {t('home.deals.all')} <ChevronRight size={16} />
            </Link>
          }
        />
        {deals.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : deals.data?.items.length ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {deals.data.items.map((d) => (
              <DealCard key={d.set_num} d={d} />
            ))}
          </div>
        ) : (
          <EmptyState title={t('home.deals.title')} text={t('home.deals.empty')} />
        )}
      </section>

      {/* Themes */}
      {themes.data && themes.data.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-20">
          <SectionHeader
            title={t('home.themes.title')}
            action={
              <Link to="/teme" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-accent hover:underline">
                {t('home.themes.all')} <ChevronRight size={16} />
              </Link>
            }
          />
          <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
            {themes.data.slice(0, 12).map((th) => (
              <ThemeTile key={th.slug} th={th} />
            ))}
          </div>
        </section>
      )}

      {/* How it works + shops */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [ClockIcon, t('home.how.1.title'), t('home.how.1.text')],
            [TagIcon, t('home.how.2.title'), t('home.how.2.text')],
            [SparkIcon, t('home.how.3.title'), t('home.how.3.text')],
          ].map(([Icon, title, text], i) => {
            const I = Icon as typeof ClockIcon;
            return (
              <div key={i} className="rounded-2xl border border-line bg-surface p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-brand-ink">
                  <I size={22} />
                </span>
                <h3 className="mt-4 text-lg font-extrabold">{title as string}</h3>
                <p className="mt-1 text-ink-2">{text as string}</p>
              </div>
            );
          })}
        </div>
        {shops.data && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-4">
            <StoreIcon size={18} className="text-ink-3" />
            {shops.data.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SHOPS[s.id]?.dot }} />
                {s.name}
                <span className="tabular font-normal text-ink-3">{num(s.offers_in_stock)}</span>
                {s.sellers > 1 && <span className="font-normal text-ink-3">· {tn('shop.sellers', s.sellers)}</span>}
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function ThemeTile({ th }: { th: Theme }) {
  return (
    <Link
      to={`/pretraga?theme=${th.slug}`}
      className="group w-40 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lift sm:w-auto"
    >
      <ProductImage src={th.image_url} alt={th.name} className="aspect-[4/3]" />
      <div className="border-t border-line px-3.5 py-3">
        <div className="truncate font-extrabold">{th.name}</div>
        <div className="text-xs text-ink-3">{tn('themes.count', th.count)}</div>
      </div>
    </Link>
  );
}

/** The day's #1 deal, shown as a big "price tag" card in the hero. */
function TopDeal({ d }: { d: Deal }) {
  const pct =
    d.reference_price_rsd && d.reference_price_rsd > d.best_price_rsd
      ? Math.round((100 * (d.reference_price_rsd - d.best_price_rsd)) / d.reference_price_rsd)
      : 0;
  return (
    <Link
      to={`/set/${d.set_num}`}
      className="group relative hidden rotate-[1.5deg] overflow-hidden rounded-[28px] border-4 border-ink bg-surface shadow-[8px_8px_0_0_var(--ink)] transition hover:rotate-0 lg:block"
    >
      <div className="flex items-center justify-between bg-ink px-5 py-3 text-bg">
        <span className="text-sm font-extrabold uppercase tracking-wider text-brand">{t('home.top.label')}</span>
        {pct >= 3 && <span className="rounded-lg bg-deal px-2 py-0.5 text-sm font-extrabold text-white">−{pct}%</span>}
      </div>
      <ProductImage src={d.image_url} alt={d.name} className="aspect-[4/3]" />
      <div className="border-t border-line p-5">
        <div className="text-xs font-semibold text-ink-3">
          {d.set_num}
          {d.theme_name ? ` · ${d.theme_name}` : ''}
        </div>
        <div className="mt-1 line-clamp-2 text-lg font-extrabold leading-snug">{d.name}</div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
          <span className="tabular whitespace-nowrap text-3xl font-extrabold tracking-tight text-deal">{rsd(d.best_price_rsd)}</span>
          {pct >= 3 && <span className="tabular whitespace-nowrap text-sm text-ink-3 line-through">{rsd(d.reference_price_rsd)}</span>}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-2">
          {d.best_shop && <ShopDot shop={d.best_shop} />}
          {shopLabel(d.best_shop, d.best_seller)}
        </div>
        {d.reasons[0] && <div className="mt-3 text-sm font-semibold text-save">✓ {reasonText(d.reasons[0])}</div>}
      </div>
    </Link>
  );
}
