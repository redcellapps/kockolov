import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ChevronRight, ClockIcon, LockIcon, SparkIcon, StoreIcon, TagIcon } from '../components/icons';
import { Hero } from '../components/home/Hero';
import { DealCard, ProductImage } from '../components/SetCard';
import { CardSkeleton, EmptyState, SectionHeader } from '../components/ui';
import { t, tn } from '../i18n';
import { api, type Deal, type Shop, type Stats, type Theme } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, SHOPS } from '../lib/format';
import { usePageTitle } from '../lib/title';

export default function Home() {
  usePageTitle(null);
  const { user, registrationOpen } = useAuth();
  const deals = useQuery({ queryKey: ['deals', 12], queryFn: () => api<{ day: string | null; items: Deal[] }>('/api/deals?limit=12') });
  const themes = useQuery({ queryKey: ['themes'], queryFn: () => api<Theme[]>('/api/themes'), staleTime: 600_000 });
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/api/stats'), staleTime: 300_000 });
  const shops = useQuery({ queryKey: ['shops'], queryFn: () => api<Shop[]>('/api/shops'), staleTime: 600_000 });

  return (
    <>
      <Hero deal={deals.data?.items[0]} dealLoading={deals.isLoading} stats={stats.data} />

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
            {shops.data.filter((s) => s.offers_in_stock > 0).map((s) => (
              <span key={s.id} className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SHOPS[s.id]?.dot }} />
                {s.name}
                <span className="tabular font-normal text-ink-3">{num(s.offers_in_stock)}</span>
                {s.sellers > 1 && <span className="font-normal text-ink-3">· {tn('shop.sellers', s.sellers)}</span>}
                {s.members_only && (
                  <span title={t('members.badge')} className="text-ink-3">
                    <LockIcon size={13} />
                    <span className="sr-only">{t('members.badge')}</span>
                  </span>
                )}
              </span>
            ))}
            {!user && !!stats.data?.members_shops && (
              <Link
                to={registrationOpen ? '/registracija' : '/prijava'}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink-3/50 px-3 py-1.5 text-sm font-bold text-ink hover:border-ink"
              >
                <LockIcon size={14} /> {tn('members.moreShops', stats.data.members_shops)}
              </Link>
            )}
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
