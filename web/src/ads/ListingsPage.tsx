import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, Button, buttonClasses, Chip, Spinner } from '../components/ui';
import { t, tn } from '../i18n';
import { usePageTitle } from '../lib/title';
import { AdCard } from './AdCard';
import { CONDITIONS, useAds, type Listing } from './store';

const inp = 'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-ink';
const sel = 'h-10 rounded-xl border border-line bg-surface px-3 text-sm font-semibold outline-none focus:border-ink';

interface F {
  q: string;
  cond: string[];
  theme: string[];
  city: string[];
  min: string;
  max: string;
  y1: string;
  y2: string;
  box: boolean;
  man: boolean;
  ship: boolean;
  hasSet: boolean;
}
const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

function readF(p: URLSearchParams): F {
  return {
    q: p.get('q') ?? '',
    cond: csv(p.get('c')),
    theme: csv(p.get('th')),
    city: csv(p.get('city')),
    min: p.get('min') ?? '',
    max: p.get('max') ?? '',
    y1: p.get('y1') ?? '',
    y2: p.get('y2') ?? '',
    box: p.get('box') === '1',
    man: p.get('man') === '1',
    ship: p.get('ship') === '1',
    hasSet: p.get('set') === '1',
  };
}
function writeF(f: F, sort: string): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.cond.length) p.set('c', f.cond.join(','));
  if (f.theme.length) p.set('th', f.theme.join(','));
  if (f.city.length) p.set('city', f.city.join(','));
  if (f.min) p.set('min', f.min);
  if (f.max) p.set('max', f.max);
  if (f.y1) p.set('y1', f.y1);
  if (f.y2) p.set('y2', f.y2);
  if (f.box) p.set('box', '1');
  if (f.man) p.set('man', '1');
  if (f.ship) p.set('ship', '1');
  if (f.hasSet) p.set('set', '1');
  if (sort !== 'new') p.set('sort', sort);
  return p;
}

type Facet = 'cond' | 'theme' | 'city';
/** All filters, except the group the counts are for (so every option shows how many ads it would give) */
function matches(l: Listing, f: F, skip?: Facet): boolean {
  const hay = `${l.title} ${l.description} ${l.set_num ?? ''} ${l.theme_name ?? ''} ${l.city}`.toLowerCase();
  return (
    (!f.q || f.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) &&
    (skip === 'cond' || !f.cond.length || f.cond.includes(l.condition)) &&
    (skip === 'theme' || !f.theme.length || f.theme.includes(l.theme_name ?? '')) &&
    (skip === 'city' || !f.city.length || f.city.includes(l.city)) &&
    (!f.min || l.price_rsd >= Number(f.min)) &&
    (!f.max || l.price_rsd <= Number(f.max)) &&
    (!f.y1 || (l.year ?? 0) >= Number(f.y1)) &&
    (!f.y2 || (l.year !== null && l.year <= Number(f.y2))) &&
    (!f.box || l.has_box) &&
    (!f.man || l.has_manual) &&
    (!f.ship || l.shipping === 'ships') &&
    (!f.hasSet || !!l.set_num)
  );
}

function Group({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line pb-4 last:border-0 last:pb-0">
      <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-sm font-extrabold">
        {title}
        <span className="text-ink-3 transition group-open:rotate-180" aria-hidden>⌄</span>
      </summary>
      <div className="mt-2 space-y-1.5">{children}</div>
    </details>
  );
}

function Checks({ options, value, onChange, limit = 6 }: { options: { key: string; label: string; count: number }[]; value: string[]; onChange: (v: string[]) => void; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = (all ? options : options.slice(0, limit)).filter((o) => o.count > 0 || value.includes(o.key));
  return (
    <>
      {shown.map((o) => (
        <label key={o.key} className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={value.includes(o.key)} onChange={() => onChange(value.includes(o.key) ? value.filter((x) => x !== o.key) : [...value, o.key])} />
          <span className="flex-1 truncate">{o.label}</span>
          <span className="tabular text-xs text-ink-3">{o.count}</span>
        </label>
      ))}
      {options.length > limit && (
        <button type="button" className="text-xs font-bold text-accent hover:underline" onClick={() => setAll(!all)}>
          {all ? t('ads.filter.less') : t('ads.filter.more')}
        </button>
      )}
    </>
  );
}

const QUICK: [string, string, string][] = [
  ['', '3000', 'do 3.000'],
  ['3000', '10000', '3.000 – 10.000'],
  ['10000', '30000', '10.000 – 30.000'],
  ['30000', '', '30.000+'],
];

export default function ListingsPage() {
  usePageTitle(t('title.ads'));
  const ads = useAds();
  const all = (ads.data ?? []).filter((l) => l.status === 'active');
  const [sp, setSp] = useSearchParams();
  const f = readF(sp);
  const sort = sp.get('sort') ?? 'new';
  const [showFilters, setShowFilters] = useState(false);
  const set = (patch: Partial<F>, s = sort) => setSp(writeF({ ...f, ...patch }, s), { replace: true });

  const count = <K extends string>(skip: Facet, key: (l: Listing) => K | null) => {
    const m = new Map<K, number>();
    for (const l of all) if (matches(l, f, skip)) {
      const k = key(l);
      if (k !== null) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const cCond = count('cond', (l) => l.condition);
  const cTheme = count('theme', (l) => l.theme_name);
  const cCity = count('city', (l) => l.city);
  const themes = [...new Set(all.map((l) => l.theme_name).filter(Boolean) as string[])].map((k) => ({ key: k, label: k, count: cTheme.get(k) ?? 0 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const cities = [...new Set(all.map((l) => l.city))].map((k) => ({ key: k, label: k, count: cCity.get(k) ?? 0 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const items = all
    .filter((l) => matches(l, f))
    .sort((a, b) => (sort === 'asc' ? a.price_rsd - b.price_rsd : sort === 'desc' ? b.price_rsd - a.price_rsd : +new Date(b.created_at) - +new Date(a.created_at)));

  const chips: { label: string; clear: () => void }[] = [
    ...f.cond.map((c) => ({ label: t(`cond.${c}` as 'cond.parts'), clear: () => set({ cond: f.cond.filter((x) => x !== c) }) })),
    ...f.theme.map((x) => ({ label: x, clear: () => set({ theme: f.theme.filter((y) => y !== x) }) })),
    ...f.city.map((x) => ({ label: x, clear: () => set({ city: f.city.filter((y) => y !== x) }) })),
    ...(f.min || f.max ? [{ label: `${f.min || '0'} – ${f.max || '∞'} RSD`, clear: () => set({ min: '', max: '' }) }] : []),
    ...(f.y1 || f.y2 ? [{ label: `${f.y1 || '…'} – ${f.y2 || '…'}`, clear: () => set({ y1: '', y2: '' }) }] : []),
    ...(f.ship ? [{ label: t('ads.filter.shipsOnly'), clear: () => set({ ship: false }) }] : []),
    ...(f.box ? [{ label: t('ads.filter.withBox'), clear: () => set({ box: false }) }] : []),
    ...(f.man ? [{ label: t('ads.filter.withManual'), clear: () => set({ man: false }) }] : []),
    ...(f.hasSet ? [{ label: t('ads.filter.hasSet'), clear: () => set({ hasSet: false }) }] : []),
  ];
  const clearAll = () => setSp(writeF({ q: '', cond: [], theme: [], city: [], min: '', max: '', y1: '', y2: '', box: false, man: false, ship: false, hasSet: false }, sort), { replace: true });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('ads.title')}</h1>
          <p className="mt-2 max-w-2xl text-ink-2">{t('ads.subtitle')}</p>
        </div>
        <Link to="/oglasi/novi" className={buttonClasses('primary', 'md')}>
          + {t('ads.post')}
        </Link>
      </div>

      <input className={`${inp} mb-3 !h-12 !text-[15px]`} value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder={t('ads.search.placeholder')} aria-label={t('ads.search.placeholder')} />
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {CONDITIONS.map((c) => (
          <Chip key={c} active={f.cond.includes(c)} onClick={() => set({ cond: f.cond.includes(c) ? f.cond.filter((x) => x !== c) : [...f.cond, c] })} count={cCond.get(c) ?? 0}>
            {t(`cond.${c}`)}
          </Chip>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr] lg:gap-6">
        <div className="lg:hidden">
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            {t('ads.filter.toggle')}{chips.length ? ` (${chips.length})` : ''}
          </Button>
        </div>
        <aside className={`${showFilters ? 'block' : 'hidden'} h-fit space-y-4 rounded-2xl border border-line bg-surface p-4 lg:block`}>
          <Group title={t('ads.filter.price')}>
            <div className="flex gap-2">
              <input className={inp} inputMode="numeric" placeholder={t('ads.filter.from')} value={f.min} onChange={(e) => set({ min: e.target.value.replace(/\D/g, '') })} />
              <input className={inp} inputMode="numeric" placeholder={t('ads.filter.to')} value={f.max} onChange={(e) => set({ max: e.target.value.replace(/\D/g, '') })} />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK.map(([a, b, label]) => (
                <Chip key={label} active={f.min === a && f.max === b} onClick={() => (f.min === a && f.max === b ? set({ min: '', max: '' }) : set({ min: a, max: b }))} className="!h-8 !px-3 text-xs">
                  {label}
                </Chip>
              ))}
            </div>
          </Group>
          <Group title={t('ads.filter.condition')}>
            <Checks options={CONDITIONS.map((c) => ({ key: c, label: t(`cond.${c}`), count: cCond.get(c) ?? 0 }))} value={f.cond} onChange={(cond) => set({ cond })} limit={5} />
          </Group>
          <Group title={t('ads.filter.theme')}>
            <Checks options={themes} value={f.theme} onChange={(theme) => set({ theme })} />
          </Group>
          <Group title={t('ads.filter.city')}>
            <Checks options={cities} value={f.city} onChange={(city) => set({ city })} />
          </Group>
          <Group title={t('ads.filter.year')} open={false}>
            <div className="flex gap-2">
              <input className={inp} inputMode="numeric" placeholder={t('ads.filter.from')} value={f.y1} onChange={(e) => set({ y1: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
              <input className={inp} inputMode="numeric" placeholder={t('ads.filter.to')} value={f.y2} onChange={(e) => set({ y2: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            </div>
          </Group>
          <Group title={t('ads.filter.shipping')}>
            {([['ship', t('ads.filter.shipsOnly')], ['box', t('ads.filter.withBox')], ['man', t('ads.filter.withManual')], ['hasSet', t('ads.filter.hasSet')]] as const).map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={f[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<F>)} /> {label}
              </label>
            ))}
          </Group>
        </aside>

        <div>
          {chips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2" aria-label={t('ads.filter.activeLabel')}>
              {chips.map((c, i) => (
                <button key={i} type="button" onClick={c.clear} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-bold text-bg">
                  {c.label} <span aria-hidden>✕</span>
                </button>
              ))}
              <Button variant="ghost" size="sm" onClick={clearAll}>{t('ads.filter.clear')}</Button>
            </div>
          )}
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-ink-2">{tn('ads.count', items.length)}</span>
            <label className="flex items-center gap-2 font-semibold text-ink-3">
              {t('ads.sort')}
              <select className={sel} value={sort} onChange={(e) => set({}, e.target.value)}>
                <option value="new">{t('ads.sort.new')}</option>
                <option value="asc">{t('ads.sort.priceAsc')}</option>
                <option value="desc">{t('ads.sort.priceDesc')}</option>
              </select>
            </label>
          </div>
          {ads.isLoading ? (
            <div className="grid min-h-[30vh] place-items-center"><Spinner className="h-8 w-8" /></div>
          ) : ads.isError ? (
            <EmptyState title={t('ads.error.title')} text={t('ads.error.text')} />
          ) : items.length ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {items.map((l) => (
                <AdCard key={l.id} l={l} />
              ))}
            </div>
          ) : (
            <EmptyState title={t('ads.empty.title')} text={t('ads.empty.text')} action={<Link to="/oglasi/novi" className={buttonClasses('primary')}>{t('ads.post')}</Link>} />
          )}
        </div>
      </div>
    </div>
  );
}
