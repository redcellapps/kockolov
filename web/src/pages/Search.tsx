import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Filters, activeFilterCount, readFilters, writeFilters, type FilterState } from '../components/Filters';
import { FilterIcon, XIcon } from '../components/icons';
import { SetCard } from '../components/SetCard';
import { Button, CardSkeleton, EmptyState, ErrorState, Spinner, cx } from '../components/ui';
import { t, tn, type TKey } from '../i18n';
import { api, type SearchResponse, type Theme } from '../lib/api';
import { shopName } from '../lib/format';
import { usePageTitle } from '../lib/title';

const SORTS = ['relevance', 'deal', 'discount', 'price_asc', 'price_desc', 'newest', 'name'];
const PAGE = 24;

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const f = useMemo(() => readFilters(params), [params]);
  const [sheet, setSheet] = useState(false);

  const q = useInfiniteQuery({
    queryKey: ['sets', writeFilters(f).toString()],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const p = writeFilters(f);
      p.set('page', String(pageParam));
      p.set('size', String(PAGE));
      if (!f.stock) p.set('stock', '0');
      return api<SearchResponse>(`/api/sets?${p}`);
    },
    getNextPageParam: (last) => (last.page * last.size < last.total ? last.page + 1 : undefined),
    placeholderData: (prev) => prev,
  });

  const themes = useQuery({ queryKey: ['themes'], queryFn: () => api<Theme[]>('/api/themes'), staleTime: 600_000 });
  const onlyTheme = f.themes.length === 1 && !f.q ? themes.data?.find((x) => x.slug === f.themes[0])?.name : undefined;
  usePageTitle(f.q ? t('title.search', { q: f.q }) : onlyTheme ? t('title.theme', { name: onlyTheme }) : t('title.all'));

  const first = q.data?.pages[0];
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = first?.total ?? 0;
  const sort = f.sort || first?.sort || (f.q ? 'relevance' : 'deal');
  const update = (next: FilterState) => setParams(writeFilters(next), { replace: false });
  const nActive = activeFilterCount(f);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {f.q ? <>„{f.q}”</> : t('nav.search')}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-ink-2">
            {first ? tn('results.count', total) : t('common.loading')}
            {q.isFetching && !q.isFetchingNextPage && <Spinner className="h-4 w-4" />}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="lg:hidden" onClick={() => setSheet(true)}>
            <FilterIcon size={18} /> {t('filters.title')}
            {nActive > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-xs text-bg">{nActive}</span>}
          </Button>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <span className="hidden sm:inline">{t('sort.label')}</span>
            <select
              value={sort}
              onChange={(e) => update({ ...f, sort: e.target.value })}
              className="h-11 rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold text-ink outline-none focus:border-ink cursor-pointer"
            >
              {SORTS.filter((s) => s !== 'relevance' || f.q).map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}` as TKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <ActiveChips f={f} onChange={update} />

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
            <Filters value={f} onChange={update} facets={first?.facets} />
          </div>
        </aside>

        <div className={cx('transition-opacity', q.isFetching && !q.isFetchingNextPage && q.data && 'opacity-60')}>
          {q.isError ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : q.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title={t('results.empty.title')}
              text={t('results.empty.text')}
              action={
                nActive > 0 && (
                  <Button variant="outline" onClick={() => update({ ...readFilters(new URLSearchParams()), q: f.q })}>
                    {t('filters.clear')}
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {items.map((s) => (
                  <SetCard key={s.set_num} s={s} />
                ))}
              </div>
              {q.hasNextPage && (
                <div className="mt-8 flex justify-center">
                  <Button variant="outline" size="lg" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                    {q.isFetchingNextPage ? <Spinner /> : t('results.more')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* mobile filter sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg lg:hidden" role="dialog" aria-modal="true" aria-label={t('filters.title')}>
          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <span className="text-lg font-extrabold">{t('filters.title')}</span>
            <button onClick={() => setSheet(false)} className="rounded-xl p-2 hover:bg-surface-2 cursor-pointer" aria-label={t('common.close')}>
              <XIcon />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5">
            <Filters value={f} onChange={update} facets={first?.facets} />
          </div>
          <div className="flex gap-2 border-t border-line p-4">
            {nActive > 0 && (
              <Button variant="outline" onClick={() => update({ ...readFilters(new URLSearchParams()), q: f.q })}>
                {t('filters.clear')}
              </Button>
            )}
            <Button className="flex-1" onClick={() => setSheet(false)}>
              {t('filters.show', { n: tn('results.count', total) })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveChips({ f, onChange }: { f: FilterState; onChange: (f: FilterState) => void }) {
  const themes = useQuery({ queryKey: ['themes'], queryFn: () => api<Theme[]>('/api/themes'), staleTime: 600_000 });
  const themeName = (slug: string) => themes.data?.find((x) => x.slug === slug)?.name ?? slug;
  const chips: { label: string; clear: () => void }[] = [];
  f.themes.forEach((th) => chips.push({ label: themeName(th), clear: () => onChange({ ...f, themes: f.themes.filter((x) => x !== th) }) }));
  f.shops.forEach((s) => chips.push({ label: shopName(s), clear: () => onChange({ ...f, shops: f.shops.filter((x) => x !== s) }) }));
  if (f.min !== undefined || f.max !== undefined)
    chips.push({
      label: `${f.min ?? 0} – ${f.max ?? '∞'} RSD`,
      clear: () => onChange({ ...f, min: undefined, max: undefined }),
    });
  f.ages.forEach((a) => chips.push({ label: `${t(`filters.age.${a}` as TKey)}`, clear: () => onChange({ ...f, ages: f.ages.filter((x) => x !== a) }) }));
  if (f.sale) chips.push({ label: t('filters.sale'), clear: () => onChange({ ...f, sale: false }) });
  if (!f.stock) chips.push({ label: `+ ${t('card.outOfStock').toLowerCase()}`, clear: () => onChange({ ...f, stock: true }) });
  if (!chips.length) return null;
  return (
    <div className="mb-5 flex flex-wrap gap-2 lg:hidden">
      {chips.map((c) => (
        <button
          key={c.label}
          onClick={c.clear}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-semibold text-bg cursor-pointer"
        >
          {c.label} <XIcon size={14} />
        </button>
      ))}
    </div>
  );
}
