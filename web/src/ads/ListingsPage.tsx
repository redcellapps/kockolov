import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, Button, buttonClasses, Chip } from '../components/ui';
import { t, tn } from '../i18n';
import { usePageTitle } from '../lib/title';
import { AdCard } from './AdCard';
import { CONDITIONS, resetPrototype, useListings, type Condition } from './store';

export function ProtoBanner() {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-ink-3 bg-surface-2 px-4 py-2.5 text-sm text-ink-2">
      <span>🧪 {t('ads.proto')}</span>
      <button className="font-bold underline underline-offset-2" onClick={resetPrototype}>
        {t('ads.resetProto')}
      </button>
    </div>
  );
}

const sel = 'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-semibold outline-none focus:border-ink';
const inp = 'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-ink';

export default function ListingsPage() {
  usePageTitle(t('title.ads'));
  const all = useListings().filter((l) => l.status === 'active');
  const [q, setQ] = useState('');
  const [conds, setConds] = useState<Condition[]>([]);
  const [theme, setTheme] = useState('');
  const [city, setCity] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [box, setBox] = useState(false);
  const [manual, setManual] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<'new' | 'asc' | 'desc'>('new');

  const themes = useMemo(() => [...new Map(all.filter((l) => l.theme_slug).map((l) => [l.theme_slug!, l.theme_name!])).entries()], [all]);
  const cities = useMemo(() => [...new Set(all.map((l) => l.city))].sort(), [all]);
  const dirty = q || conds.length || theme || city || min || max || box || manual;

  const items = all
    .filter((l) => {
      const hay = `${l.title} ${l.description} ${l.set_num ?? ''} ${l.theme_name ?? ''}`.toLowerCase();
      return (
        (!q || q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) &&
        (!conds.length || conds.includes(l.condition)) &&
        (!theme || l.theme_slug === theme) &&
        (!city || l.city === city) &&
        (!min || l.price_rsd >= Number(min)) &&
        (!max || l.price_rsd <= Number(max)) &&
        (!box || l.has_box) &&
        (!manual || l.has_manual)
      );
    })
    .sort((a, b) => (sort === 'asc' ? a.price_rsd - b.price_rsd : sort === 'desc' ? b.price_rsd - a.price_rsd : +new Date(b.created_at) - +new Date(a.created_at)));

  const clear = () => (setQ(''), setConds([]), setTheme(''), setCity(''), setMin(''), setMax(''), setBox(false), setManual(false));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <ProtoBanner />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('ads.title')}</h1>
          <p className="mt-2 max-w-2xl text-ink-2">{t('ads.subtitle')}</p>
        </div>
        <Link to="/oglasi/novi" className={buttonClasses('primary', 'md')}>
          + {t('ads.post')}
        </Link>
      </div>

      <input className={`${inp} mb-3 !h-12 !text-[15px]`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ads.search.placeholder')} aria-label={t('ads.search.placeholder')} />
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {CONDITIONS.map((c) => (
          <Chip key={c} active={conds.includes(c)} onClick={() => setConds((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))} count={all.filter((l) => l.condition === c).length}>
            {t(`cond.${c}`)}
          </Chip>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[250px_1fr] lg:gap-6">
        <div className="lg:hidden">
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            {t('ads.filter.toggle')}{dirty ? ' •' : ''}
          </Button>
        </div>
        <aside className={`${showFilters ? 'grid' : 'hidden'} h-fit grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-4 lg:grid lg:grid-cols-1`}>
          <label className="text-xs font-bold text-ink-3">
            {t('ads.filter.theme')}
            <select className={`${sel} mt-1`} value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">{t('ads.filter.all')}</option>
              {themes.map(([s, n]) => (
                <option key={s} value={s}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-ink-3">
            {t('ads.filter.city')}
            <select className={`${sel} mt-1`} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">{t('ads.filter.all')}</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="col-span-2 text-xs font-bold text-ink-3 lg:col-span-1">
            {t('ads.filter.price')}
            <div className="mt-1 flex gap-2">
              <input className={inp} inputMode="numeric" placeholder={t('ads.filter.from')} value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
              <input className={inp} inputMode="numeric" placeholder={t('ads.filter.to')} value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={box} onChange={(e) => setBox(e.target.checked)} /> {t('ads.filter.withBox')}
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> {t('ads.filter.withManual')}
          </label>
          {dirty ? (
            <Button variant="ghost" size="sm" className="col-span-2 lg:col-span-1" onClick={clear}>
              {t('ads.filter.clear')}
            </Button>
          ) : null}
        </aside>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-ink-2">{tn('ads.count', items.length)}</span>
            <label className="flex items-center gap-2 font-semibold text-ink-3">
              {t('ads.sort')}
              <select className={`${sel} !w-auto`} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="new">{t('ads.sort.new')}</option>
                <option value="asc">{t('ads.sort.priceAsc')}</option>
                <option value="desc">{t('ads.sort.priceDesc')}</option>
              </select>
            </label>
          </div>
          {items.length ? (
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
