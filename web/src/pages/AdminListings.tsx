import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { AdminNav } from '../components/admin/AdminNav';
import { Button, Spinner } from '../components/ui';
import { t } from '../i18n';
import { api } from '../lib/api';
import { ago } from '../lib/format';
import { usePageTitle } from '../lib/title';

interface Report {
  id: number;
  reason: string;
  created_at: string;
  conversation_id: number | null;
  listing_id: number | null;
  listing_title: string | null;
  listing_status: string | null;
  owner_email: string | null;
  reporter_email: string | null;
}
interface Removed {
  id: number;
  title: string;
  removed_reason: string | null;
  updated_at: string;
  owner_email: string;
}
interface Conv {
  messages: { id: number; sender: string; text: string; at: string }[];
}

const field = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-ink';

function ReportCard({ r, onDone }: { r: Report; onDone: () => void }) {
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState('');
  const [showConv, setShowConv] = useState(false);
  const conv = useQuery({
    queryKey: ['admin', 'ads-conv', r.conversation_id],
    queryFn: () => api<Conv>(`/api/admin/oglasi/razgovor/${r.conversation_id}`),
    enabled: showConv && !!r.conversation_id,
  });
  const resolve = useMutation({ mutationFn: () => api(`/api/admin/oglasi/prijave/${r.id}/reseno`, { method: 'POST', json: {} }), onSuccess: onDone });
  const remove = useMutation({
    mutationFn: () => api(`/api/admin/oglasi/${r.listing_id}/ukloni`, { method: 'POST', json: { reason: reason.trim() } }),
    onSuccess: onDone,
  });
  const err = (resolve.error ?? remove.error) as Error | null;
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-3">
            {r.conversation_id ? t('admin.ads.reportConv') : t('admin.ads.reportOn')} · {ago(r.created_at)}
          </p>
          <p className="mt-0.5 font-extrabold">{r.listing_title ?? '—'}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{r.reason}</p>
          <p className="mt-1 text-xs text-ink-3">
            {t('admin.ads.by', { who: r.reporter_email ?? '—' })} · {t('admin.ads.owner', { who: r.owner_email ?? '—' })}
            {r.listing_status === 'removed' && ` · ${t('admin.ads.statusRemoved')}`}
          </p>
        </div>
        {r.listing_id && (
          <Link to={`/oglasi/${r.listing_id}`} className="text-sm font-bold underline">
            {t('admin.ads.open')}
          </Link>
        )}
      </div>

      {r.conversation_id && (
        <div className="mt-3">
          {!showConv ? (
            <button type="button" className="cursor-pointer text-sm font-bold underline" onClick={() => setShowConv(true)}>
              {t('admin.ads.readConv')}
            </button>
          ) : conv.isLoading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <ul className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
              {conv.data?.messages.map((m) => (
                <li key={m.id}>
                  <span className="font-bold">{m.sender}</span> <span className="text-xs text-ink-3">{ago(m.at)}</span>
                  <p className="whitespace-pre-line">{m.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {removing ? (
        <div className="mt-3 grid gap-2">
          <textarea rows={2} maxLength={300} className={field} placeholder={t('admin.ads.reasonPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="dark" disabled={reason.trim().length < 3 || remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? <Spinner className="h-4 w-4" /> : t('admin.ads.confirmRemove')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRemoving(false)}>
              {t('admin.ads.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.listing_id && r.listing_status !== 'removed' && (
            <Button size="sm" variant="dark" onClick={() => setRemoving(true)}>
              {t('admin.ads.remove')}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate()}>
            {t('admin.ads.resolve')}
          </Button>
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-deal">{err.message}</p>}
    </li>
  );
}

export default function AdminListingsPage() {
  const qc = useQueryClient();
  usePageTitle(t('admin.nav.ads'));
  const reports = useQuery({ queryKey: ['admin', 'ads-reports'], queryFn: () => api<{ items: Report[] }>('/api/admin/oglasi/prijave'), refetchInterval: 30_000 });
  const removed = useQuery({ queryKey: ['admin', 'ads-removed'], queryFn: () => api<{ items: Removed[] }>('/api/admin/oglasi/uklonjeni') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const restore = useMutation({ mutationFn: (id: number) => api(`/api/admin/oglasi/${id}/vrati`, { method: 'POST', json: {} }), onSuccess: refresh });

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('admin.title')}</h1>
        <AdminNav />
      </div>

      <section className="rounded-3xl border border-line bg-surface-2/40 p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-extrabold">{t('admin.ads.reports')}</h2>
        {reports.isLoading ? (
          <Spinner className="h-5 w-5" />
        ) : reports.data?.items.length ? (
          <ul className="grid gap-3">
            {reports.data.items.map((r) => (
              <ReportCard key={r.id} r={r} onDone={refresh} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">{t('admin.ads.noReports')}</p>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-extrabold">{t('admin.ads.removed')}</h2>
        {removed.data?.items.length ? (
          <ul className="divide-y divide-line">
            {removed.data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link to={`/oglasi/${a.id}`} className="font-bold underline">
                    {a.title}
                  </Link>
                  <p className="text-xs text-ink-3">
                    {a.owner_email} · {ago(a.updated_at)}
                    {a.removed_reason ? ` · ${a.removed_reason}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => restore.mutate(a.id)}>
                  {t('admin.ads.restore')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">{t('admin.ads.noRemoved')}</p>
        )}
      </section>
    </div>
  );
}
