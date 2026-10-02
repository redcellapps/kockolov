import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { t, type TKey } from '../i18n';
import { api, type SearchResponse, type Shop, type Theme } from '../lib/api';
import { displayCurrency, fromDisplay, num, toDisplay, type Currency } from '../lib/format';
import { CheckIcon, LockIcon } from './icons';
import { Chip, ShopDot, Toggle, cx } from './ui';

export interface FilterState {
  q: string;
  themes: string[];
  shops: string[];
  ages: string[];
  min?: number;
  max?: number;
  sale: boolean;
  stock: boolean;
  sort: string;
}

export function readFilters(p: URLSearchParams): FilterState {
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(',').filter(Boolean) : []);
  const n = (k: string) => (p.get(k) && !Number.isNaN(Number(p.get(k))) ? Number(p.get(k)) : undefined);
  return {
    q: p.get('q') ?? '',
    themes: list('theme'),
    shops: list('shop'),
    ages: list('age'),
    min: n('min'),
    max: n('max'),
    sale: p.get('sale') === '1',
    stock: p.get('stock') !== '0',
    sort: p.get('sort') ?? '',
  };
}

export function writeFilters(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.themes.length) p.set('theme', f.themes.join(','));
  if (f.shops.length) p.set('shop', f.shops.join(','));
  if (f.ages.length) p.set('age', f.ages.join(','));
  if (f.min !== undefined) p.set('min', String(f.min));
  if (f.max !== undefined) p.set('max', String(f.max));
  if (f.sale) p.set('sale', '1');
  if (!f.stock) p.set('stock', '0');
  if (f.sort) p.set('sort', f.sort);
  return p;
}

export function activeFilterCount(f: FilterState): number {
  return f.themes.length + f.shops.length + f.ages.length + (f.min !== undefined || f.max !== undefined ? 1 : 0) + (f.sale ? 1 : 0) + (f.stock ? 0 : 1);
}

const AGES = ['1-3', '4-6', '7-9', '10-13', '14-17', '18'] as const;
// price ranges in the reader's currency; the URL and the API always use RSD
const PRICE_PRESETS: Record<Currency, [number | undefined, number | undefined, TKey][]> = {
  RSD: [
    [undefined, 2000, 'filters.price.p1'],
    [2000, 5000, 'filters.price.p2'],
    [5000, 10000, 'filters.price.p3'],
    [10000, 20000, 'filters.price.p4'],
    [20000, undefined, 'filters.price.p5'],
  ],
  EUR: [
    [undefined, 20, 'filters.priceEur.p1'],
    [20, 50, 'filters.priceEur.p2'],
    [50, 100, 'filters.priceEur.p3'],
    [100, 200, 'filters.priceEur.p4'],
    [200, undefined, 'filters.priceEur.p5'],
  ],
};
const inDisplay = (rsd: number | undefined) => (rsd === undefined ? '' : String(Math.round(toDisplay(rsd))));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line py-5 first:pt-0 last:border-0">
      <h3 className="mb-3 text-xs font-extrabold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function CheckRow({ checked, onChange, children, count }: { checked: boolean; onChange: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="checkbox"
      aria-checked={checked}
      className="group flex w-full items-center gap-2.5 rounded-lg py-1.5 text-left text-[15px] cursor-pointer"
    >
      <span
        className={cx(
          'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition',
          checked ? 'border-ink bg-ink text-bg' : 'border-line bg-surface group-hover:border-ink-3',
        )}
      >
        {checked && <CheckIcon size={14} strokeWidth={3} />}
      </span>
      <span className={cx('flex-1 truncate', checked ? 'font-bold text-ink' : 'text-ink-2 group-hover:text-ink')}>{children}</span>
      {count !== undefined && <span className="tabular text-xs text-ink-3">{num(count)}</span>}
    </button>
  );
}

export function Filters({
  value,
  onChange,
  facets,
}: {
  value: FilterState;
  onChange: (f: FilterState) => void;
  facets?: SearchResponse['facets'];
}) {
  const themes = useQuery({ queryKey: ['themes'], queryFn: () => api<Theme[]>('/api/themes'), staleTime: 600_000 });
  const shops = useQuery({ queryKey: ['shops'], queryFn: () => api<Shop[]>('/api/shops'), staleTime: 600_000 });
  const [themeQuery, setThemeQuery] = useState('');
  const [showAllThemes, setShowAllThemes] = useState(false);
  const [minText, setMinText] = useState(inDisplay(value.min));
  const [maxText, setMaxText] = useState(inDisplay(value.max));
  useEffect(() => {
    setMinText(inDisplay(value.min));
    setMaxText(inDisplay(value.max));
  }, [value.min, value.max]);

  const toggle = (key: 'themes' | 'shops' | 'ages', v: string) => {
    const cur = value[key];
    onChange({ ...value, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };

  const themeCounts = useMemo(() => new Map((facets?.themes ?? []).map((f) => [f.slug, f.count])), [facets]);
  const shopCounts = useMemo(() => new Map((facets?.shops ?? []).map((f) => [f.id, f.count])), [facets]);
  const themeList = useMemo(() => {
    const list = (themes.data ?? []).map((th) => ({ ...th, n: facets ? (themeCounts.get(th.slug) ?? 0) : th.count }));
    list.sort((a, b) => Number(value.themes.includes(b.slug)) - Number(value.themes.includes(a.slug)) || b.n - a.n);
    const q = themeQuery.trim().toLowerCase();
    return q ? list.filter((th) => th.name.toLowerCase().includes(q)) : list;
  }, [themes.data, themeCounts, facets, value.themes, themeQuery]);
  const visibleThemes = showAllThemes || themeQuery ? themeList : themeList.slice(0, 10);

  const applyPrice = () => {
    const min = minText ? fromDisplay(Math.max(0, parseInt(minText.replace(/\D/g, ''), 10))) : undefined;
    const max = maxText ? fromDisplay(Math.max(0, parseInt(maxText.replace(/\D/g, ''), 10))) : undefined;
    if (min !== value.min || max !== value.max) onChange({ ...value, min, max });
  };

  return (
    <div>
      <Section title={t('filters.display')}>
        <Toggle checked={value.stock} onChange={(v) => onChange({ ...value, stock: v })} label={t('filters.stock')} />
        <Toggle checked={value.sale} onChange={(v) => onChange({ ...value, sale: v })} label={t('filters.sale')} />
      </Section>

      <Section title={t('filters.theme')}>
        {(themes.data?.length ?? 0) > 10 && (
          <input
            value={themeQuery}
            onChange={(e) => setThemeQuery(e.target.value)}
            placeholder={t('filters.themeSearch')}
            className="mb-2 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
          />
        )}
        <div className="space-y-0.5">
          {visibleThemes.map((th) => (
            <CheckRow key={th.slug} checked={value.themes.includes(th.slug)} onChange={() => toggle('themes', th.slug)} count={th.n}>
              {th.name}
            </CheckRow>
          ))}
        </div>
        {!themeQuery && themeList.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAllThemes((s) => !s)}
            className="mt-2 text-sm font-bold text-accent hover:underline cursor-pointer"
          >
            {showAllThemes ? t('filters.less') : t('filters.more', { n: themeList.length })}
          </button>
        )}
      </Section>

      <Section title={t('filters.price', { cur: displayCurrency() === 'EUR' ? '€' : 'RSD' })}>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            onBlur={applyPrice}
            onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
            placeholder={t('filters.price.min')}
            aria-label={t('filters.price.min')}
            className="tabular h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
          />
          <span className="text-ink-3">–</span>
          <input
            inputMode="numeric"
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            onBlur={applyPrice}
            onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
            placeholder={t('filters.price.max')}
            aria-label={t('filters.price.max')}
            className="tabular h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRICE_PRESETS[displayCurrency()].map(([dMin, dMax, key]) => {
            const min = dMin === undefined ? undefined : fromDisplay(dMin);
            const max = dMax === undefined ? undefined : fromDisplay(dMax);
            const label = t(key);
            const active = value.min === min && value.max === max;
            return (
              <Chip
                key={label}
                active={active}
                className="h-8 px-3 text-[13px]"
                onClick={() => onChange({ ...value, min: active ? undefined : min, max: active ? undefined : max })}
              >
                {label}
              </Chip>
            );
          })}
        </div>
      </Section>

      <Section title={t('filters.shop')}>
        <div className="space-y-0.5">
          {(shops.data ?? []).filter((s) => s.offers_in_stock > 0 || value.shops.includes(s.id)).map((s) => (
            <CheckRow key={s.id} checked={value.shops.includes(s.id)} onChange={() => toggle('shops', s.id)} count={shopCounts.get(s.id) ?? (facets ? 0 : s.offers_in_stock)}>
              <span className="inline-flex items-center gap-2">
                <ShopDot shop={s.id} /> {s.name}
                {s.members_only && (
                  <span title={t('members.badge')} className="text-ink-3">
                    <LockIcon size={12} />
                    <span className="sr-only">{t('members.badge')}</span>
                  </span>
                )}
              </span>
            </CheckRow>
          ))}
        </div>
      </Section>

      <Section title={t('filters.age')}>
        <div className="flex flex-wrap gap-1.5">
          {AGES.map((a) => (
            <Chip key={a} active={value.ages.includes(a)} className="h-8 px-3 text-[13px]" onClick={() => toggle('ages', a)}>
              {t(`filters.age.${a}` as TKey)}
            </Chip>
          ))}
        </div>
      </Section>
    </div>
  );
}
