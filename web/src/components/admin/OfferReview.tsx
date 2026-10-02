import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { t, tn } from '../../i18n';
import { api } from '../../lib/api';
import { rsd, shopName } from '../../lib/format';
import { ChevronDown, ChevronRight, EyeOffIcon, SearchIcon, XIcon } from '../icons';
import { Button, ShopDot, cx } from '../ui';
import { SetNumForm } from './SetNumForm';

interface Offer {
  id: number;
  shop_id: string;
  seller: string;
  title: string;
  url: string;
  price_rsd: number;
  in_stock?: boolean;
  match_method?: 'hidden' | 'hidden_rule';
}
interface Rule {
  id: number;
  phrase: string;
  shop_id: string | null;
}
interface ShopCount {
  id: string;
  name: string;
  unmatched: number;
}

const field = 'h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-ink';

/**
 * Admin: offers we couldn't link to a set. Link them by set number, or hide the ones that aren't
 * LEGO sets — one by one, all that match a search, or with a rule that also hides future ones.
 */
export function OfferReview({ shops }: { shops?: ShopCount[] }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [shop, setShop] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (shop) params.set('shop', shop);
  const open = useQuery({
    queryKey: ['admin', 'unmatched', query, shop],
    queryFn: () => api<{ total: number; items: Offer[] }>(`/api/admin/unmatched?${params}`),
    placeholderData: (prev) => prev,
  });
  const hidden = useQuery({
    queryKey: ['admin', 'hidden'],
    queryFn: () => api<{ rules: Rule[]; total: number; items: Offer[] }>('/api/admin/hidden'),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const fail = (e: unknown) => setNotice({ ok: false, text: (e as Error).message });
  const match = useMutation({
    mutationFn: ({ id, setNum, confirmNew }: { id: number; setNum: string; confirmNew: boolean }) =>
      api<{ setNum: string }>(`/api/admin/offers/${id}/match`, { method: 'POST', json: { setNum, confirmNew } }),
    onSuccess: (r) => setNotice({ ok: true, text: t('admin.offers.linked', { num: r.setNum }) }),
    onError: fail,
    onSettled: refresh,
  });
  const hide = useMutation({
    mutationFn: (ids: number[]) => api<{ hidden: number }>('/api/admin/offers/hide', { method: 'POST', json: { ids } }),
    onSuccess: (r) => setNotice({ ok: true, text: tn('admin.hide.done', r.hidden) }),
    onError: fail,
    onSettled: refresh,
  });
  const addRule = useMutation({
    mutationFn: () => api<{ hidden: number }>('/api/admin/hide-rules', { method: 'POST', json: { phrase: query, shopId: shop || null } }),
    onSuccess: (r) => {
      setNotice({ ok: true, text: t('admin.hide.ruleDone', { phrase: query, n: r.hidden }) });
      setQ('');
      setQuery('');
    },
    onError: fail,
    onSettled: refresh,
  });
  const delRule = useMutation({
    mutationFn: (id: number) => api<{ restored: number }>(`/api/admin/hide-rules/${id}`, { method: 'DELETE' }),
    onSuccess: (r) => setNotice({ ok: true, text: tn('admin.hidden.ruleDeleted', r.restored) }),
    onError: fail,
    onSettled: refresh,
  });
  const restore = useMutation({
    mutationFn: (id: number) => api(`/api/admin/offers/${id}/restore`, { method: 'POST' }),
    onError: fail,
    onSettled: refresh,
  });

  const items = open.data?.items ?? [];
  const total = open.data?.total ?? 0;
  const busy = hide.isPending || addRule.isPending;
  const shopLabel = shop ? shopName(shop) : '';
  const rules = hidden.data?.rules ?? [];

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">
          {t('admin.unmatched')} ({total})
        </h2>
        <Link to="/admin/ponude" className="inline-flex items-center gap-1 text-sm font-bold text-accent hover:underline">
          {t('admin.unmatched.all')} <ChevronRight size={15} />
        </Link>
      </div>
      <p className="mt-1 mb-4 text-sm text-ink-3">{t('admin.unmatched.hint')}</p>

      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-56 flex-1">
          <SearchIcon size={16} className="pointer-events-none absolute top-3 left-3 text-ink-3" />
          <input
            id="unmatched-q"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setNotice(null);
            }}
            placeholder={t('admin.unmatched.filter')}
            aria-label={t('admin.unmatched.filter')}
            className={cx(field, 'w-full pl-9')}
          />
        </label>
        <select
          id="unmatched-shop"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          aria-label={t('admin.unmatched.shop')}
          className={cx(field, 'cursor-pointer pr-8')}
        >
          <option value="">{t('admin.unmatched.allShops')}</option>
          {shops
            ?.filter((s) => s.unmatched > 0 || s.id === shop)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.unmatched})
              </option>
            ))}
        </select>
      </div>

      {query && total > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-3">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => hide.mutate(items.map((o) => o.id))}>
            <EyeOffIcon size={15} /> {t('admin.hide.shown', { n: items.length })}
          </Button>
          <Button size="sm" variant="dark" disabled={busy || query.length < 3} onClick={() => addRule.mutate()}>
            {shop ? t('admin.hide.ruleShop', { phrase: query, shop: shopLabel }) : t('admin.hide.rule', { phrase: query })}
          </Button>
          <span className="text-xs text-ink-3">{t('admin.hide.ruleHint')}</span>
        </div>
      )}
      {notice && <p className={cx('mt-3 text-sm font-semibold', notice.ok ? 'text-save' : 'text-deal')}>{notice.text}</p>}

      <div className="mt-4 max-h-[480px] space-y-2 overflow-y-auto">
        {items.map((o) => (
          <OpenRow
            key={o.id}
            o={o}
            busy={busy || match.isPending}
            onMatch={(setNum, confirmNew) => match.mutate({ id: o.id, setNum, confirmNew })}
            onHide={() => hide.mutate([o.id])}
          />
        ))}
        {open.data && !items.length && <p className="py-4 text-sm text-ink-3">{query ? t('admin.unmatched.none') : t('admin.unmatched.empty')}</p>}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => setShowHidden(!showHidden)}
          aria-expanded={showHidden}
          className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-ink-2 hover:text-ink"
        >
          <EyeOffIcon size={16} /> {t('admin.hidden.title', { n: hidden.data?.total ?? 0, rules: rules.length })}
          <ChevronDown size={16} className={cx('transition', showHidden && 'rotate-180')} />
        </button>
        {showHidden && hidden.data && (
          <div className="mt-3 space-y-3">
            {rules.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold tracking-wide text-ink-3 uppercase">{t('admin.hidden.rules')}</span>
                {rules.map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pr-1.5 pl-3 text-sm font-semibold">
                    „{r.phrase}“
                    <span className="font-normal text-ink-3">· {r.shop_id ? shopName(r.shop_id) : t('admin.hidden.everyShop')}</span>
                    <button
                      type="button"
                      title={t('admin.hidden.deleteRule')}
                      aria-label={`${t('admin.hidden.deleteRule')} „${r.phrase}“`}
                      disabled={delRule.isPending}
                      onClick={() => delRule.mutate(r.id)}
                      className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-line hover:text-ink"
                    >
                      <XIcon size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-ink-3">{t('admin.hidden.hint')}</p>
            <div className="max-h-[360px] space-y-1.5 overflow-y-auto">
              {hidden.data.items.map((o) => (
                <div key={o.id} className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-1 text-sm hover:bg-surface-2">
                  <ShopDot shop={o.shop_id} />
                  <a href={o.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink-2 hover:underline">
                    {o.title}
                  </a>
                  <span className="tabular hidden text-xs text-ink-3 sm:inline">{rsd(o.price_rsd)}</span>
                  {o.match_method === 'hidden_rule' ? (
                    <span className="inline-flex h-7 items-center rounded-full bg-surface-2 px-3 text-xs text-ink-3">{t('admin.hidden.byRule')}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(o.id)}
                      className="h-7 cursor-pointer rounded-full border border-line px-3 text-xs font-bold text-ink-2 hover:border-ink-3 hover:text-ink"
                    >
                      {t('admin.hidden.restore')}
                    </button>
                  )}
                </div>
              ))}
              {!hidden.data.items.length && <p className="text-sm text-ink-3">{t('admin.hidden.empty')}</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function OpenRow({
  o,
  busy,
  onMatch,
  onHide,
}: {
  o: Offer;
  busy: boolean;
  onMatch: (setNum: string, confirmNew: boolean) => void;
  onHide: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border border-line px-3 pt-2.5 pb-1">
      <ShopDot shop={o.shop_id} className="mt-1.5" />
      <div className="min-w-0 flex-1 basis-64">
        <a href={o.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold hover:underline">
          {o.title}
        </a>
        <div className="text-xs text-ink-3">
          {shopName(o.shop_id)}
          {o.seller && ` · ${o.seller}`} · {rsd(o.price_rsd)}
        </div>
      </div>
      <SetNumForm
        busy={busy}
        submitLabel={t('admin.match')}
        onSave={onMatch}
        extra={
          <Button size="sm" variant="ghost" type="button" disabled={busy} onClick={onHide} title={t('admin.hide.one')}>
            <EyeOffIcon size={15} /> {t('admin.hide')}
          </Button>
        }
      />
    </div>
  );
}
