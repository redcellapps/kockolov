import { Link } from 'react-router';
import { t, tn } from '../../i18n';
import type { Deal, Stats } from '../../lib/api';
import { BlocksIcon, LockIcon, SparkIcon, StoreIcon, TagIcon, UserIcon } from '../icons';
import { SearchBox } from '../SearchBox';
import { HeroDeal, HeroDealSkeleton } from './HeroDeal';

const POPULAR = ['Hogvorts', 'Milenijumski soko', 'Ferrari', 'Botanicals', 'Božićni kalendar', 'Minecraft'];

/** One faint 2×2 brick behind the deal card (desktop only). */
function BrickShape() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      className="pointer-events-none absolute -right-24 top-1/2 hidden h-[36rem] w-[36rem] -translate-y-1/2 rotate-[-8deg] text-hero-ink/[0.045] lg:block"
    >
      <rect x="10" y="10" width="180" height="180" rx="18" fill="currentColor" />
      {[60, 140].flatMap((cx) =>
        [60, 140].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="26" fill="currentColor" />),
      )}
    </svg>
  );
}

export function Hero({
  deal,
  dealLoading,
  stats,
  unlock,
}: {
  deal?: Deal;
  dealLoading: boolean;
  stats?: Stats;
  /** visitors: link to the sign-up invitation under the hero ("+N prodavnica uz besplatan nalog") */
  unlock?: number;
}) {
  const facts = stats
    ? [
        { Icon: BlocksIcon, n: stats.sets_in_stock, key: 'home.stats.sets' },
        { Icon: TagIcon, n: stats.offers_in_stock, key: 'home.stats.offers' },
        { Icon: StoreIcon, n: stats.shops, key: 'home.stats.shops' },
        { Icon: UserIcon, n: stats.sellers, key: 'home.stats.sellers' },
      ]
    : [];

  return (
    <section aria-labelledby="hero-title" className="hero hero-bg relative isolate overflow-hidden border-b border-hero-ink/10 text-hero-ink">
      <div className="hero-studs absolute inset-0 -z-10" aria-hidden />
      <BrickShape />

      <div className="hero-grid relative mx-auto max-w-7xl px-4 pb-12 pt-9 sm:px-6 sm:pb-16 sm:pt-14 lg:pb-20 lg:pt-16">
        <div className="hero-main min-w-0">
          {/* 1. Badge, headline, one sentence */}
          <div className="order-1">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-hero-ink px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand">
              <SparkIcon size={14} /> {t('app.tagline')}
            </p>
            <h1 id="hero-title" className="mt-5 text-balance text-[2.125rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              {t('home.hero.title')}
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-base text-hero-ink/80 sm:text-lg">{t('home.hero.subtitle')}</p>
          </div>

          {/* 2. Search, the main action, with popular searches under it */}
          <div className="order-2 lg:mt-8">
            <SearchBox size="lg" className="max-w-2xl lg:max-w-none" />
            <nav aria-label={t('home.popularLabel')} className="mt-4">
              <ul className="scrollbar-none -mx-4 flex items-center gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(90deg,#000_88%,transparent)] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none]">
                <li className="shrink-0 text-sm font-semibold text-hero-ink/75" aria-hidden>
                  {t('home.popular')}
                </li>
                {POPULAR.map((p) => (
                  <li key={p} className="shrink-0">
                    <Link
                      to={`/pretraga?q=${encodeURIComponent(p)}`}
                      className="inline-flex h-9 items-center rounded-full border border-hero-ink/10 bg-hero-paper/80 px-3.5 text-sm font-semibold transition hover:border-hero-ink/40 hover:bg-hero-paper"
                    >
                      {p}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* 4. Quiet trust numbers (after the deal on phones) */}
          {facts.length > 0 && (
            <dl className="order-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:gap-y-3 lg:mt-9">
              {facts.map(({ Icon, n, key }, i) => (
                <div key={key} className={i > 0 ? 'flex items-center gap-2.5 sm:border-l sm:border-hero-ink/15 sm:pl-5 sm:pr-5' : 'flex items-center gap-2.5 sm:pr-5'}>
                  <Icon size={20} className="shrink-0 text-hero-ink/60" />
                  <div className="flex flex-col-reverse">
                    <dt className="text-xs font-semibold text-hero-ink/75">{tn(key, n)}</dt>
                    <dd className="tabular text-lg font-extrabold leading-tight">{new Intl.NumberFormat('sr-RS').format(n)}</dd>
                  </div>
                </div>
              ))}
              {!!unlock && (
                <div className="col-span-2 sm:basis-full">
                  <a
                    href="#members-cta"
                    onClick={(e) => {
                      // scroll here instead of changing the address, so the router's scroll-to-top doesn't kick in
                      e.preventDefault();
                      document.getElementById('members-cta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-hero-ink px-3.5 text-sm font-bold text-brand transition hover:opacity-90"
                  >
                    <LockIcon size={14} /> {tn('members.moreShops', unlock)}
                  </a>
                </div>
              )}
            </dl>
          )}
        </div>

        {/* 3. Today's best deal, plus the secondary action */}
        <aside aria-label={t('home.top.label')} className="order-3 w-full max-w-xl lg:max-w-none">
          {deal ? <HeroDeal d={deal} updated={stats?.last_update} /> : dealLoading ? <HeroDealSkeleton /> : null}
          <Link
            to="/ponude"
            className="mt-4 flex h-11 items-center justify-center rounded-xl border-2 border-hero-ink px-4 font-bold transition hover:bg-hero-ink hover:text-brand"
          >
            {t('home.hero.todayDeals')}
          </Link>
        </aside>
      </div>
    </section>
  );
}
