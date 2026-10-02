import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AdminNav } from '../components/admin/AdminNav';
import { SetNumForm, SetThumb } from '../components/admin/SetNumForm';
import { AlertIcon, ChevronDown, EyeOffIcon, PencilIcon, SearchIcon, UndoIcon } from '../components/icons';
import { Button, Chip, ShopDot, Spinner, cx } from '../components/ui';
import { t, type TKey } from '../i18n';
import { api } from '../lib/api';
import { ago, num, rsd, shopName } from '../lib/format';
import { useMedia } from '../lib/media';
import { usePageTitle } from '../lib/title';

const FILTERS = ['all', 'linked', 'manual', 'check', 'open', 'merch', 'hidden'] as const;
type Filter = (typeof FILTERS)[number];
type Sort = 'title' | 'shop' | 'price' | 'set' | 'linked';

type Doubt = { kind: 'number'; num: string } | { kind: 'name' } | { kind: 'price' };
interface Row {
  id: number;
  shop_id: string;
  seller: string;
  title: string;
  url: string;
  price_rsd: number;
  in_stock: boolean;
  set_num: string | null;
  set_name: string | null;
  set_image: string | null;
  match_method: string | null;
  manual_at: string | null;
  manual_by: string | null;
  doubts: Doubt[];
}
interface List {
  total: number;
  page: number;
  pages: number;
  size: number;
  sort: Sort;
  counts: Record<Filter, number>;
  items: Row[];
}
interface Changed {
  setNum: string | null;
  method?: string | null;
  dropped: string[];
}

const METHOD: Record<string, TKey> = {
  manual: 'admin.offers.m.manual',
  sku: 'admin.offers.m.sku',
  title: 'admin.offers.m.title',
  name: 'admin.offers.m.name',
  merch: 'admin.offers.m.merch',
  hidden: 'admin.offers.m.hidden',
  hidden_rule: 'admin.offers.m.hidden_rule',
};

const field = 'h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-ink';
const small =
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 text-xs font-bold text-ink-2 hover:border-ink-3 hover:text-ink disabled:cursor-default disabled:opacity-50';

function doubtText(d: Doubt): string {
  if (d.kind === 'number') return t('admin.offers.doubt.number', { num: d.num });
  return t(d.kind === 'name' ? 'admin.offers.doubt.name' : 'admin.offers.doubt.price');
}

/** Admin: every offer on the site with the set it's linked to; fix a wrong number, undo a hand-made link, hide. */
export default function AdminOffersPage() {
  usePageTitle(t('title.adminOffers'));
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  // "trazi", not "q": the header's set search reads q on every page
  const q = params.get('trazi') ?? '';
  const shop = params.get('shop') ?? '';
  const filter: Filter = (FILTERS as readonly string[]).includes(params.get('filter') ?? '') ? (params.get('filter') as Filter) : 'all';
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  // the search box writes to the address after a short pause in typing
  const [text, setText] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => {
      if (text.trim() !== q) update({ trazi: text.trim() || null, page: null });
    }, 300);
    return () => clearTimeout(id);
  }, [text]);

  const list = useQuery({
    queryKey: ['admin', 'offers', params.toString()],
    queryFn: () => {
      const query = new URLSearchParams(params);
      query.delete('trazi');
      if (q) query.set('q', q);
      return api<List>(`/api/admin/offers?${query}`);
    },
    placeholderData: (prev) => prev,
  });
  const shops = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api<{ shops: { id: string; name: string; active_offers: number }[] }>('/api/admin/overview'),
  });

  const wide = useMedia('(min-width: 768px)');
  const [editing, setEditing] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const fail = (e: unknown) => setNotice({ ok: false, text: (e as Error).message });
  const droppedText = (r: Changed) => (r.dropped.length ? ` ${t('admin.offers.dropped', { nums: r.dropped.join(', ') })}` : '');

  const match = useMutation({
    mutationFn: (v: { id: number; setNum: string; confirmNew: boolean }) =>
      api<Changed>(`/api/admin/offers/${v.id}/match`, {
        method: 'POST',
        json: { setNum: v.setNum, confirmNew: v.confirmNew },
      }),
    onSuccess: (r) => {
      setEditing(null);
      setNotice({
        ok: true,
        text: t('admin.offers.linked', { num: r.setNum ?? '' }) + droppedText(r),
      });
    },
    onError: fail,
    onSettled: refresh,
  });
  const auto = useMutation({
    mutationFn: (id: number) => api<Changed>(`/api/admin/offers/${id}/auto`, { method: 'POST' }),
    onSuccess: (r) =>
      setNotice({
        ok: true,
        text: (r.setNum ? t('admin.offers.autoDone', { num: r.setNum }) : t('admin.offers.autoNone')) + droppedText(r),
      }),
    onError: fail,
    onSettled: refresh,
  });
  const hide = useMutation({
    mutationFn: (id: number) => api(`/api/admin/offers/hide`, { method: 'POST', json: { ids: [id] } }),
    onSuccess: () => setNotice({ ok: true, text: t('admin.offers.hidden') }),
    onError: fail,
    onSettled: refresh,
  });
  const restore = useMutation({
    mutationFn: (id: number) => api(`/api/admin/offers/${id}/restore`, { method: 'POST' }),
    onSuccess: () => setNotice({ ok: true, text: t('admin.offers.restored') }),
    onError: fail,
    onSettled: refresh,
  });
  const busy = match.isPending || auto.isPending || hide.isPending || restore.isPending;

  const data = list.data;
  const sort = data?.sort ?? 'title';
  const sortBy = (key: Sort) =>
    update({
      sort: key,
      dir: key === sort && dir === 'asc' ? 'desc' : null,
      page: null,
    });
  const th = (k: Sort, label: string, className?: string) => (
    <th
      className={cx('py-2.5 pr-3 font-bold', className)}
      aria-sort={sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button type="button" onClick={() => sortBy(k)} className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-ink">
        {label}
        <ChevronDown
          size={13}
          className={cx('transition', sort === k ? 'text-ink' : 'opacity-0', sort === k && dir === 'asc' && 'rotate-180')}
        />
      </button>
    </th>
  );
  const shopCell = (o: Row) => (
    <div className="min-w-0">
      <div className="flex items-center gap-2 font-semibold">
        <ShopDot shop={o.shop_id} /> <span className="truncate">{shopName(o.shop_id)}</span>
      </div>
      {o.seller && <div className="truncate pl-4.5 text-xs text-ink-3">{o.seller}</div>}
    </div>
  );
  const offerCell = (o: Row) => (
    <>
      <a href={o.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-semibold hover:underline" title={o.title}>
        {o.title}
      </a>
      {!o.in_stock && <div className="text-xs text-ink-3">{t('admin.offers.outOfStock')}</div>}
    </>
  );
  const setCell = (o: Row) =>
    o.set_num ? (
      <div className="flex min-w-0 items-start gap-2.5">
        <SetThumb src={o.set_image} className="h-9 w-9" />
        <div className="min-w-0">
          <Link to={`/set/${encodeURIComponent(o.set_num)}`} className="tabular font-extrabold hover:underline">
            {o.set_num}
          </Link>
          <div className="line-clamp-1 text-xs text-ink-2" title={o.set_name ?? ''}>
            {o.set_name}
          </div>
          {o.doubts.map((d) => (
            <div key={d.kind} className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-deal">
              <AlertIcon size={13} className="shrink-0" /> {doubtText(d)}
            </div>
          ))}
        </div>
      </div>
    ) : (
      <span className="text-ink-3">—</span>
    );
  const linkCell = (o: Row) => (
    <div>
      <span
        className={cx(
          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold',
          o.match_method === 'manual'
            ? 'bg-brand/30 text-ink'
            : o.set_num
              ? 'bg-surface-2 text-ink-2'
              : o.match_method?.startsWith('hidden')
                ? 'bg-ink/10 text-ink-2'
                : 'bg-deal-soft text-deal',
        )}
      >
        {t(METHOD[o.match_method ?? ''] ?? 'admin.offers.m.none')}
      </span>
      {o.match_method === 'manual' && o.manual_at && (
        <div className="mt-1 text-xs text-ink-3">{[o.manual_by, ago(o.manual_at)].filter(Boolean).join(' · ')}</div>
      )}
      {o.match_method === 'manual' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => auto.mutate(o.id)}
          title={t('admin.offers.auto.title')}
          className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-accent hover:underline disabled:opacity-50"
        >
          <UndoIcon size={13} /> {t('admin.offers.auto')}
        </button>
      )}
    </div>
  );
  const actions = (o: Row) => (
    <div className="flex flex-wrap gap-1.5 md:justify-end">
      {o.match_method !== 'hidden_rule' && (
        <button
          type="button"
          className={small}
          aria-expanded={editing === o.id}
          onClick={() => {
            setEditing(editing === o.id ? null : o.id);
            setNotice(null);
          }}
        >
          <PencilIcon size={13} /> {o.set_num ? t('admin.offers.edit') : t('admin.match')}
        </button>
      )}
      {o.match_method === 'hidden' ? (
        <button type="button" className={small} disabled={busy} onClick={() => restore.mutate(o.id)}>
          {t('admin.hidden.restore')}
        </button>
      ) : o.match_method === 'hidden_rule' ? (
        <span className="inline-flex h-8 items-center px-2 text-xs text-ink-3">{t('admin.offers.byRule')}</span>
      ) : (
        <button type="button" className={small} disabled={busy} onClick={() => hide.mutate(o.id)} title={t('admin.hide.one')}>
          <EyeOffIcon size={13} /> {t('admin.hide')}
        </button>
      )}
    </div>
  );
  const editor = (o: Row) => (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-2 rounded-2xl border border-line bg-surface p-4">
      <div className="max-w-sm min-w-0 flex-1 basis-56 text-sm">
        <div className="text-xs font-bold tracking-wide text-ink-3 uppercase">{t('admin.offers.editTitle')}</div>
        <p className="mt-1 text-ink-2">{t('admin.offers.editHint')}</p>
      </div>
      <SetNumForm
        current={o.set_num}
        autoFocus
        busy={match.isPending}
        submitLabel={t('admin.setnum.save')}
        onSave={(setNum, confirmNew) => match.mutate({ id: o.id, setNum, confirmNew })}
        onCancel={() => setEditing(null)}
      />
    </div>
  );
  const from = data && data.total ? (data.page - 1) * data.size + 1 : 0;
  const to = data ? Math.min(data.page * data.size, data.total) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('admin.title')}</h1>
        <AdminNav />
      </div>

      <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-extrabold">{t('admin.offers.title')}</h2>
        <p className="mt-1 mb-4 max-w-3xl text-sm text-ink-3">{t('admin.offers.intro')}</p>

        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-60 flex-1">
            <SearchIcon size={16} className="pointer-events-none absolute top-3 left-3 text-ink-3" />
            <input
              id="offers-q"
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('admin.offers.search')}
              aria-label={t('admin.offers.search')}
              className={cx(field, 'w-full pl-9')}
            />
          </label>
          <select
            id="offers-shop"
            value={shop}
            onChange={(e) => update({ shop: e.target.value || null, page: null })}
            aria-label={t('admin.unmatched.shop')}
            className={cx(field, 'cursor-pointer pr-8')}
          >
            <option value="">{t('admin.unmatched.allShops')}</option>
            {shops.data?.shops
              .filter((s) => s.active_offers > 0 || s.id === shop)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({num(s.active_offers)})
                </option>
              ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('admin.offers.show')}>
          {FILTERS.map((f) => (
            <Chip
              key={f}
              active={filter === f}
              count={data?.counts[f]}
              onClick={() =>
                update({
                  filter: f === 'all' ? null : f,
                  sort: null,
                  dir: null,
                  page: null,
                })
              }
            >
              {f === 'check' && <AlertIcon size={14} className={cx(filter !== f && (data?.counts.check ?? 0) > 0 && 'text-deal')} />}
              {t(`admin.offers.f.${f}` as TKey)}
            </Chip>
          ))}
        </div>
        {filter === 'check' && <p className="mt-2 max-w-3xl text-xs text-ink-3">{t('admin.offers.checkHint')}</p>}
        {filter === 'manual' && <p className="mt-2 max-w-3xl text-xs text-ink-3">{t('admin.offers.manualHint')}</p>}
        {notice && (
          <p role="status" className={cx('mt-3 text-sm font-semibold', notice.ok ? 'text-save' : 'text-deal')}>
            {notice.text}
          </p>
        )}

        {/* wide screens: a table; phones: one card per offer */}
        {wide ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="text-left text-xs tracking-wide text-ink-3">
                <tr>
                  {th('shop', t('admin.offers.col.shop'), 'w-40')}
                  {th('title', t('admin.offers.col.offer'))}
                  {th('price', t('admin.offers.col.price'), 'w-28 text-right')}
                  {th('set', t('admin.offers.col.set'), 'w-72 pl-3')}
                  {th('linked', t('admin.offers.col.link'), 'w-44')}
                  <th className="w-48" />
                </tr>
              </thead>
              <tbody className={cx(list.isPlaceholderData && 'opacity-60')}>
                {data?.items.map((o) => (
                  <Fragment key={o.id}>
                    <tr className={cx('border-t border-line align-top', editing === o.id && 'bg-surface-2')}>
                      <td className="py-2.5 pr-3">{shopCell(o)}</td>
                      <td className="max-w-0 py-2.5 pr-3">{offerCell(o)}</td>
                      <td className="tabular py-2.5 pr-3 text-right whitespace-nowrap">{rsd(o.price_rsd)}</td>
                      <td className="py-2 pr-3 pl-3">{setCell(o)}</td>
                      <td className="py-2.5 pr-3">{linkCell(o)}</td>
                      <td className="py-2">{actions(o)}</td>
                    </tr>
                    {editing === o.id && (
                      <tr className="bg-surface-2">
                        <td colSpan={6} className="px-3 pt-1 pb-3">
                          {editor(o)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={cx('mt-4 space-y-2', list.isPlaceholderData && 'opacity-60')}>
            {data?.items.map((o) => (
              <div key={o.id} className={cx('space-y-2.5 rounded-2xl border border-line p-3.5', editing === o.id && 'bg-surface-2')}>
                <div className="flex items-start justify-between gap-3 text-sm">
                  {shopCell(o)}
                  <span className="tabular shrink-0 font-semibold">{rsd(o.price_rsd)}</span>
                </div>
                <div className="text-sm">{offerCell(o)}</div>
                <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  {setCell(o)}
                  {linkCell(o)}
                </div>
                {actions(o)}
                {editing === o.id && editor(o)}
              </div>
            ))}
          </div>
        )}

        {list.isLoading && (
          <div className="grid place-items-center py-10">
            <Spinner className="h-7 w-7" />
          </div>
        )}
        {data && !data.items.length && <p className="py-8 text-center text-sm text-ink-3">{t('admin.offers.empty')}</p>}

        {data && data.total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
            <span className="text-ink-3">
              {t('admin.offers.range', {
                from: num(from),
                to: num(to),
                total: num(data.total),
              })}
            </span>
            {data.pages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.page <= 1}
                  onClick={() =>
                    update({
                      page: data.page > 2 ? String(data.page - 1) : null,
                    })
                  }
                >
                  {t('admin.offers.prev')}
                </Button>
                <span className="tabular px-1 text-ink-2">
                  {t('admin.offers.page', {
                    page: data.page,
                    pages: data.pages,
                  })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.page >= data.pages}
                  onClick={() => update({ page: String(data.page + 1) })}
                >
                  {t('admin.offers.next')}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
