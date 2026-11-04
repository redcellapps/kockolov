import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ChevronRight, InstagramIcon } from '../components/icons';
import { EmptyState, ErrorState, ShopDot, Skeleton, buttonClasses, cx } from '../components/ui';
import { t } from '../i18n';
import { api, type IgFeed, type IgFeedItem } from '../lib/api';
import { money, shopLabel } from '../lib/format';
import { serverUrl } from '../lib/platform';
import { INSTAGRAM_URL } from '../lib/site';
import { usePageTitle } from '../lib/title';

/*
 * /ig: the page behind the one link in the Instagram bio. Instagram doesn't let the link be changed
 * automatically, so it always points here: the newest "set dana" on top, the earlier posts below
 * (the same pictures as on the profile), each with the set's price today.
 */

/** visits from here are counted as coming from the Instagram bio */
const FROM_BIO = 'utm_source=instagram&utm_medium=bio';
const setLink = (num: string) => `/set/${encodeURIComponent(num)}?${FROM_BIO}`;

/** "29. oktobar", never split over two lines (YYYY-MM-DD read at noon so no time zone moves it) */
const dayLabel = (d: string) =>
  new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'long' }).format(new Date(`${d}T12:00:00`)).replace(' ', ' ');

function Shop({ item, className }: { item: IgFeedItem; className?: string }) {
  if (!item.best_shop) return null;
  return (
    <div className={cx('flex min-w-0 items-center gap-1.5 text-ink-2', className)}>
      <ShopDot shop={item.best_shop} />
      <span className="truncate">{shopLabel(item.best_shop, item.best_seller)}</span>
    </div>
  );
}

/** The newest post: its picture next to today's price */
function Latest({ item }: { item: IgFeedItem }) {
  const cheaper = item.best_price !== null && item.best_price < item.post_price;
  return (
    <Link
      to={setLink(item.set_num)}
      className="group mt-6 grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-4 rounded-3xl border border-line bg-surface p-3 shadow transition hover:shadow-lg sm:mt-8 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-8 sm:p-5 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]"
    >
      <img
        src={serverUrl(item.thumb)}
        srcSet={`${serverUrl(item.thumb)} 540w, ${serverUrl(item.image)} 1080w`}
        sizes="(min-width: 768px) 19rem, (min-width: 640px) 15rem, 8.5rem"
        width={1080}
        height={1350}
        alt={item.name}
        fetchPriority="high"
        className="h-auto w-full rounded-2xl border border-line"
      />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-3 sm:text-xs">{t('ig.latest', { day: dayLabel(item.day) })}</p>
        <h2 className="mt-1.5 line-clamp-3 text-lg font-extrabold leading-snug tracking-tight text-balance sm:text-3xl">{item.name}</h2>
        <p className="mt-1 truncate text-[13px] font-semibold text-ink-3 sm:text-sm">
          <span className="tabular">{item.set_num}</span>
          {item.theme_name && ` · ${item.theme_name}`}
        </p>
        {item.best_price === null ? (
          <p className="mt-3 font-semibold text-ink-3 sm:mt-5">{t('ig.outOfStock')}</p>
        ) : (
          <div className="mt-3 sm:mt-5">
            <p className="hidden text-xs font-bold uppercase tracking-wide text-ink-3 sm:block">{t('ig.now')}</p>
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <span className={cx('tabular whitespace-nowrap text-2xl font-extrabold tracking-tight sm:text-4xl', cheaper && 'text-save')}>
                {money(item.best_price)}
              </span>
              {item.best_price !== item.post_price && (
                <span className="tabular whitespace-nowrap text-[13px] text-ink-3">{t('ig.inPost', { price: money(item.post_price) })}</span>
              )}
            </div>
            <Shop item={item} className="mt-1 text-[13px] sm:text-sm" />
            {cheaper && (
              <span className="mt-2 inline-block rounded-full bg-save-soft px-2.5 py-0.5 text-xs font-bold text-save">{t('ig.cheaper')}</span>
            )}
          </div>
        )}
        <span className={buttonClasses('primary', 'sm', 'mt-3 sm:mt-6 sm:h-11 sm:px-4 sm:text-[15px]')}>
          {t('ig.allPrices')} <ChevronRight size={18} />
        </span>
      </div>
    </Link>
  );
}

/** An earlier post, as on the Instagram grid, with today's price under it */
function Tile({ item }: { item: IgFeedItem }) {
  const cheaper = item.best_price !== null && item.best_price < item.post_price;
  return (
    <Link to={setLink(item.set_num)} className="group flex min-w-0 flex-col" aria-label={`${item.set_num} ${item.name}`}>
      <img
        src={serverUrl(item.thumb)}
        width={540}
        height={675}
        alt=""
        loading="lazy"
        className="h-auto w-full rounded-2xl border border-line transition group-hover:-translate-y-0.5 group-hover:shadow-lift"
      />
      <p className="mt-2 text-xs font-semibold text-ink-3">{dayLabel(item.day)}</p>
      <h3 className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-snug">{item.name}</h3>
      {item.best_price === null ? (
        <p className="mt-1 text-[13px] text-ink-3">{t('ig.outOfStock')}</p>
      ) : (
        <>
          <span className={cx('tabular mt-1 whitespace-nowrap text-lg font-extrabold tracking-tight', cheaper && 'text-save')}>
            {money(item.best_price)}
          </span>
          <Shop item={item} className="text-[13px]" />
        </>
      )}
    </Link>
  );
}

export default function InstagramPage() {
  usePageTitle(t('title.ig'));
  const q = useQuery({ queryKey: ['instagram'], queryFn: () => api<IgFeed>('/api/instagram') });
  const [latest, ...earlier] = q.data?.items ?? [];
  const user = q.data?.username || 'kockolov';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-2xl">
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-2 hover:text-ink hover:underline"
        >
          <InstagramIcon size={16} /> {t('ig.handle', { user })}
        </a>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">{t('ig.title')}</h1>
        <p className="mt-2 text-ink-2 sm:mt-3 sm:text-lg">{t('ig.subtitle')}</p>
      </header>

      {q.isLoading && <Skeleton className="mt-8 h-64" />}
      {q.isError && (
        <div className="mt-8">
          <ErrorState onRetry={() => q.refetch()} />
        </div>
      )}
      {q.data && !latest && (
        <div className="mt-8">
          <EmptyState
            title={t('ig.empty')}
            text={t('ig.emptyText')}
            action={
              <Link to={`/ponude?${FROM_BIO}`} className={buttonClasses('primary')}>
                {t('ig.deals')}
              </Link>
            }
          />
        </div>
      )}

      {latest && <Latest item={latest} />}

      {earlier.length > 0 && (
        <section className="mt-10 sm:mt-14">
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{t('ig.earlier')}</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
            {earlier.map((item) => (
              <Tile key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {latest && (
        <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-8 sm:mt-14">
          <Link to={`/ponude?${FROM_BIO}`} className={buttonClasses('dark')}>
            {t('ig.deals')} <ChevronRight size={18} />
          </Link>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener" className={buttonClasses('outline')}>
            <InstagramIcon size={18} /> {t('ig.follow', { user })}
          </a>
        </div>
      )}
    </div>
  );
}
