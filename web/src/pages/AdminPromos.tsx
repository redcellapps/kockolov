import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminNav } from '../components/admin/AdminNav';
import { Button, Chip, Spinner } from '../components/ui';
import { t } from '../i18n';
import { api } from '../lib/api';
import { ago } from '../lib/format';
import { PROMO_KINDS, promoFacts, type Promo, type PromoKind, type PromoStatus } from '../lib/promos';
import { usePageTitle } from '../lib/title';

interface Shop {
  id: string;
  name: string;
}
interface CrawlRow {
  source: string;
  found: number;
  added: number;
  changed: number;
  error?: string;
}
interface Draft {
  shop_id: string;
  kind: PromoKind;
  title: string;
  details: string;
  min_basket_rsd: string;
  discount_pct: string;
  themes: string;
  valid_until: string;
  source_url: string;
}

const field = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-ink';
const EMPTY: Draft = { shop_id: '', kind: 'gift', title: '', details: '', min_basket_rsd: '', discount_pct: '', themes: '', valid_until: '', source_url: '' };

function PromoRow({ p, onDone }: { p: Promo; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [details, setDetails] = useState(p.details);
  const patch = useMutation({ mutationFn: (body: object) => api(`/api/admin/akcije/${p.id}`, { method: 'PATCH', json: body }), onSuccess: onDone });
  const del = useMutation({ mutationFn: () => api(`/api/admin/akcije/${p.id}`, { method: 'DELETE' }), onSuccess: onDone });
  const busy = patch.isPending || del.isPending;
  const err = (patch.error ?? del.error) as Error | null;
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink-3">
        <span className="font-extrabold text-ink">{p.shop_name}</span>
        <span>{t(`promo.kind.${p.kind}`)}</span>
        <span>· {p.source === 'manual' ? t('admin.promos.manual') : t('admin.promos.auto')}</span>
        {p.changed && <span className="rounded-md bg-deal px-1.5 py-0.5 font-extrabold text-white uppercase">{t('admin.promos.changed')}</span>}
        <span>· {ago(p.last_seen_at)}</span>
      </div>
      {editing ? (
        <div className="mt-2 grid gap-2">
          <input className={field} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={field} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="dark"
              disabled={busy || title.trim().length < 3}
              onClick={() => patch.mutate({ title: title.trim(), details: details.trim() }, { onSuccess: () => setEditing(false) })}
            >
              {t('admin.promos.save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              {t('admin.ads.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 font-extrabold">{p.title}</p>
          {p.details && <p className="mt-1 text-sm text-ink-2">{p.details}</p>}
          {promoFacts(p).length > 0 && <p className="mt-1 text-sm font-semibold">{promoFacts(p).join(' · ')}</p>}
          <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-bold underline">
            {t('promo.source')}
          </a>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {p.status !== 'approved' && (
          <Button size="sm" variant="dark" disabled={busy} onClick={() => patch.mutate({ status: 'approved' })}>
            {t('admin.promos.approve')}
          </Button>
        )}
        {p.status !== 'rejected' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => patch.mutate({ status: 'rejected' })}>
            {p.status === 'approved' ? t('admin.promos.hide') : t('admin.promos.reject')}
          </Button>
        )}
        {p.status === 'approved' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => patch.mutate({ status: 'pending' })}>
            {t('admin.promos.backToPending')}
          </Button>
        )}
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t('admin.promos.edit')}
          </Button>
        )}
        {p.source === 'manual' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => window.confirm(t('admin.promos.confirmDelete')) && del.mutate()}>
            {t('admin.promos.delete')}
          </Button>
        )}
      </div>
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-deal">{err.message}</p>}
    </li>
  );
}

function NewPromo({ shops, onDone }: { shops: Shop[]; onDone: () => void }) {
  const [d, setD] = useState<Draft>(EMPTY);
  const set = (k: keyof Draft, v: string) => setD((x) => ({ ...x, [k]: v }));
  const create = useMutation({
    mutationFn: () =>
      api('/api/admin/akcije', {
        method: 'POST',
        json: {
          shop_id: d.shop_id,
          kind: d.kind,
          title: d.title.trim(),
          details: d.details.trim(),
          min_basket_rsd: d.min_basket_rsd ? Number(d.min_basket_rsd) : null,
          discount_pct: d.discount_pct ? Number(d.discount_pct) : null,
          themes: d.themes.split(',').map((s) => s.trim()).filter(Boolean),
          valid_from: null,
          valid_until: d.valid_until || null,
          ...(d.source_url.trim() ? { source_url: d.source_url.trim() } : {}),
        },
      }),
    onSuccess: () => {
      setD(EMPTY);
      onDone();
    },
  });
  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <select className={field} value={d.shop_id} onChange={(e) => set('shop_id', e.target.value)} required aria-label={t('admin.promos.shop')}>
        <option value="">{t('admin.promos.shop')}</option>
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select className={field} value={d.kind} onChange={(e) => set('kind', e.target.value)} aria-label={t('admin.promos.kind')}>
        {PROMO_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`promo.kind.${k}`)}
          </option>
        ))}
      </select>
      <input className={`${field} sm:col-span-2`} placeholder={t('admin.promos.titlePh')} value={d.title} maxLength={160} required onChange={(e) => set('title', e.target.value)} />
      <textarea className={`${field} sm:col-span-2`} rows={2} placeholder={t('admin.promos.detailsPh')} value={d.details} maxLength={1000} onChange={(e) => set('details', e.target.value)} />
      <input className={field} inputMode="numeric" placeholder={t('admin.promos.minPh')} value={d.min_basket_rsd} onChange={(e) => set('min_basket_rsd', e.target.value.replace(/\D/g, ''))} />
      <input className={field} inputMode="numeric" placeholder={t('admin.promos.pctPh')} value={d.discount_pct} onChange={(e) => set('discount_pct', e.target.value.replace(/\D/g, ''))} />
      <input className={field} placeholder={t('admin.promos.themesPh')} value={d.themes} onChange={(e) => set('themes', e.target.value)} />
      <input className={field} type="date" aria-label={t('admin.promos.until')} value={d.valid_until} onChange={(e) => set('valid_until', e.target.value)} />
      <input className={`${field} sm:col-span-2`} type="url" placeholder={t('admin.promos.urlPh')} value={d.source_url} onChange={(e) => set('source_url', e.target.value)} />
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" variant="dark" disabled={create.isPending || !d.shop_id || d.title.trim().length < 3}>
          {t('admin.promos.add')}
        </Button>
        {create.error && <p role="alert" className="mt-2 text-sm font-semibold text-deal">{(create.error as Error).message}</p>}
      </div>
    </form>
  );
}

export default function AdminPromosPage() {
  const qc = useQueryClient();
  usePageTitle(t('admin.nav.promos'));
  const [status, setStatus] = useState<PromoStatus>('pending');
  const list = useQuery({
    queryKey: ['admin', 'promos', status],
    queryFn: () => api<{ items: Promo[]; counts: Partial<Record<PromoStatus, number>> }>(`/api/admin/akcije?status=${status}`),
  });
  const shops = useQuery({ queryKey: ['admin', 'promo-shops'], queryFn: () => api<Shop[]>('/api/shops'), staleTime: 10 * 60_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'promos'] });
    void qc.invalidateQueries({ queryKey: ['promos'] });
  };
  const crawl = useMutation({ mutationFn: () => api<{ rows: CrawlRow[] }>('/api/admin/akcije/preuzmi', { method: 'POST', json: {} }), onSuccess: refresh });
  const counts = list.data?.counts ?? {};

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('admin.title')}</h1>
        <AdminNav />
      </div>

      <section className="rounded-3xl border border-line bg-surface-2/40 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">{t('admin.promos.title')}</h2>
          <Button size="sm" variant="outline" disabled={crawl.isPending} onClick={() => crawl.mutate()}>
            {crawl.isPending ? <Spinner className="h-4 w-4" /> : t('admin.promos.fetch')}
          </Button>
        </div>
        <p className="mb-4 text-sm text-ink-2">{t('admin.promos.lead')}</p>
        {crawl.data && (
          <ul className="mb-4 space-y-0.5 rounded-xl bg-surface p-3 text-sm">
            {crawl.data.rows.map((r) => (
              <li key={r.source}>
                <span className="font-bold">{r.source}</span>: {r.error ? <span className="text-deal">{r.error}</span> : t('admin.promos.crawlRow', { found: r.found, added: r.added, changed: r.changed })}
              </li>
            ))}
          </ul>
        )}
        {crawl.error && <p role="alert" className="mb-4 text-sm font-semibold text-deal">{(crawl.error as Error).message}</p>}

        <div className="mb-4 flex flex-wrap gap-2">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => setStatus(s)}>
              {t(`admin.promos.status.${s}`)}
            </Chip>
          ))}
        </div>
        {list.isLoading ? (
          <Spinner className="h-5 w-5" />
        ) : list.data?.items.length ? (
          <ul className="grid gap-3">
            {list.data.items.map((p) => (
              <PromoRow key={`${p.id}-${p.status}-${p.title}`} p={p} onDone={refresh} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">{t('admin.promos.none')}</p>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-extrabold">{t('admin.promos.newTitle')}</h2>
        <NewPromo shops={shops.data ?? []} onDone={refresh} />
      </section>
    </div>
  );
}
