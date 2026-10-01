import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { DealCard, SetCard } from '../components/SetCard';
import { CardSkeleton, EmptyState, ErrorState } from '../components/ui';
import { useWatchlist } from '../components/WatchButton';
import { t } from '../i18n';
import { api, type Deal, type Theme } from '../lib/api';
import { dateLong } from '../lib/format';
import { ThemeTile } from './Home';
import { usePageTitle } from '../lib/title';

function PageHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-ink-2">{subtitle}</p>}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

function Loading() {
  return (
    <Grid>
      {Array.from({ length: 8 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </Grid>
  );
}

export function DealsPage() {
  const q = useQuery({ queryKey: ['deals', 40], queryFn: () => api<{ day: string | null; items: Deal[] }>('/api/deals?limit=40') });
  usePageTitle(
    q.data?.day
      ? t('title.dealsDay', {
          date: new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${q.data.day.slice(0, 10)}T12:00:00Z`)),
        })
      : t('title.deals'),
  );
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHead title={t('deals.title')} subtitle={t('deals.subtitle')} />
      {q.data?.day && <p className="-mt-5 mb-6 text-sm font-semibold text-ink-3">{t('deals.day', { date: dateLong(q.data.day) })}</p>}
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : q.data?.items.length ? (
        <Grid>
          {q.data.items.map((d) => (
            <DealCard key={d.set_num} d={d} />
          ))}
        </Grid>
      ) : (
        <EmptyState title={t('deals.title')} text={t('home.deals.empty')} />
      )}
    </div>
  );
}

export function ThemesPage() {
  const q = useQuery({ queryKey: ['themes'], queryFn: () => api<Theme[]>('/api/themes'), staleTime: 600_000 });
  // same as the server's title: the three themes with the most sets
  usePageTitle(q.data?.length ? t('title.themesTop', { names: q.data.slice(0, 3).map((x) => x.name).join(', ') }) : t('title.themes'));
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHead title={t('themes.title')} subtitle={t('themes.subtitle')} />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {q.data!.map((th) => (
            <ThemeTile key={th.slug} th={th} />
          ))}
        </div>
      )}
    </div>
  );
}

export function WatchlistPage() {
  const q = useWatchlist();
  usePageTitle(t('title.watchlist'));
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHead title={t('watch.title')} subtitle={t('watch.subtitle')} />
      {q.isLoading ? (
        <Loading />
      ) : q.data?.items.length ? (
        <Grid>
          {q.data.items.map((s) => (
            <SetCard key={s.set_num} s={s} />
          ))}
        </Grid>
      ) : (
        <EmptyState
          title={t('watch.empty.title')}
          text={t('watch.empty.text')}
          action={
            <Link to="/ponude" className="font-bold text-accent hover:underline">
              {t('nav.deals')}
            </Link>
          }
        />
      )}
    </div>
  );
}

export function NotFoundPage() {
  usePageTitle(t('title.notFound'));
  return (
    <div className="mx-auto max-w-3xl px-4 py-20">
      <EmptyState
        title={t('notFound.title')}
        action={
          <Link to="/" className="font-bold text-accent hover:underline">
            {t('notFound.back')}
          </Link>
        }
      />
    </div>
  );
}
