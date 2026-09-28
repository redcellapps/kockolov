import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button, ShopDot, Spinner, cx } from '../components/ui';
import { t } from '../i18n';
import { api } from '../lib/api';
import { ago, num, rsd, shopName } from '../lib/format';

interface Overview {
  runs: {
    id: number;
    shop_id: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    pages: number;
    items: number;
    matched: number;
    new_items: number;
    price_changes: number;
    deactivated: number;
    error: string | null;
  }[];
  shops: { id: string; name: string; enabled: boolean; active_offers: number; unmatched: number; merch: number; name_matched: number }[];
  users: number;
  crawlRunning: boolean;
}
interface Unmatched {
  id: number;
  shop_id: string;
  seller: string;
  title: string;
  url: string;
  price_rsd: number;
  in_stock: boolean;
}
interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  digest_enabled: boolean;
  last_login_at: string | null;
}

const STATUS: Record<string, string> = {
  ok: 'bg-save-soft text-save',
  failed: 'bg-deal-soft text-deal',
  suspicious: 'bg-brand/30 text-ink',
  running: 'bg-surface-2 text-ink-2',
};

function Box({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();
  const ov = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Overview>('/api/admin/overview'), refetchInterval: 15_000 });
  const um = useQuery({ queryKey: ['admin', 'unmatched'], queryFn: () => api<Unmatched[]>('/api/admin/unmatched') });
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<AdminUser[]>('/api/admin/users') });
  const crawl = useMutation({
    mutationFn: () => api('/api/admin/crawl', { method: 'POST', json: {} }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  const match = useMutation({
    mutationFn: ({ id, setNum }: { id: number; setNum: string | null }) => api(`/api/admin/offers/${id}/match`, { method: 'POST', json: { setNum } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  const [newUser, setNewUser] = useState({ email: '', name: '', role: 'user' });
  const [created, setCreated] = useState('');
  const addUser = useMutation({
    mutationFn: () => api<{ password?: string }>('/api/admin/users', { method: 'POST', json: newUser }),
    onSuccess: (r) => {
      setCreated(r.password ? t('admin.users.created', { password: r.password }) : '');
      setNewUser({ email: '', name: '', role: 'user' });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('admin.title')}</h1>
        <Button onClick={() => crawl.mutate()} disabled={crawl.isPending || ov.data?.crawlRunning}>
          {ov.data?.crawlRunning ? (
            <>
              <Spinner className="h-4 w-4" /> {t('admin.crawl.running')}
            </>
          ) : (
            t('admin.crawl')
          )}
        </Button>
      </div>
      {crawl.isSuccess && <p className="text-sm font-semibold text-save">{t('admin.crawl.started')}</p>}
      {crawl.isError && <p className="text-sm font-semibold text-deal">{(crawl.error as Error).message}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {ov.data?.shops.map((s) => (
          <div key={s.id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-2 font-extrabold">
              <ShopDot shop={s.id} /> {s.name}
            </div>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
              <div>
                <dt className="text-xs text-ink-3">Aktivno</dt>
                <dd className="tabular font-bold">{num(s.active_offers)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Nepovezano</dt>
                <dd className="tabular font-bold">{num(s.unmatched)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Nije set</dt>
                <dd className="tabular font-bold">{num(s.merch)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Po nazivu</dt>
                <dd className="tabular font-bold">{num(s.name_matched)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <Box title={t('admin.runs')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="py-2">Prodavnica</th>
                <th>Status</th>
                <th>Početak</th>
                <th className="text-right">Str.</th>
                <th className="text-right">Ponuda</th>
                <th className="text-right">Povezano</th>
                <th className="text-right">Novih</th>
                <th className="text-right">Promena cene</th>
                <th className="pl-4">Napomena</th>
              </tr>
            </thead>
            <tbody>
              {ov.data?.runs.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2 font-semibold">{shopName(r.shop_id)}</td>
                  <td>
                    <span className={cx('rounded-md px-2 py-0.5 text-xs font-bold', STATUS[r.status])}>{r.status}</span>
                  </td>
                  <td className="text-ink-2">{ago(r.started_at)}</td>
                  <td className="tabular text-right">{r.pages}</td>
                  <td className="tabular text-right">{num(r.items)}</td>
                  <td className="tabular text-right">{num(r.matched)}</td>
                  <td className="tabular text-right">{num(r.new_items)}</td>
                  <td className="tabular text-right">{num(r.price_changes)}</td>
                  <td className="max-w-xs truncate pl-4 text-ink-3" title={r.error ?? ''}>
                    {r.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>

      <Box title={`${t('admin.unmatched')} (${um.data?.length ?? 0})`}>
        <p className="-mt-2 mb-4 text-sm text-ink-3">{t('admin.unmatched.hint')}</p>
        <div className="max-h-[480px] space-y-2 overflow-y-auto">
          {um.data?.map((o) => (
            <UnmatchedRow key={o.id} o={o} onMatch={(setNum) => match.mutate({ id: o.id, setNum })} />
          ))}
        </div>
      </Box>

      <Box title={`${t('admin.users')} (${users.data?.length ?? 0})`}>
        <form
          className="mb-4 flex flex-wrap gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            addUser.mutate();
          }}
        >
          <input
            required
            type="email"
            placeholder="e-mail"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            className="h-10 min-w-56 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
          />
          <input
            placeholder="ime"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            className="h-10 w-40 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            className="h-10 rounded-xl border border-line bg-surface px-3 text-sm"
          >
            <option value="user">korisnik</option>
            <option value="admin">administrator</option>
          </select>
          <Button size="sm" className="h-10" type="submit" disabled={addUser.isPending}>
            {t('admin.users.add')}
          </Button>
        </form>
        {created && <p className="mb-3 rounded-xl bg-save-soft px-3 py-2 text-sm font-semibold text-save">{created}</p>}
        {addUser.isError && <p className="mb-3 text-sm font-semibold text-deal">{(addUser.error as Error).message}</p>}
        <table className="w-full text-sm">
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="py-2 font-semibold">{u.email}</td>
                <td className="text-ink-2">{u.name}</td>
                <td className="text-ink-2">{u.role}</td>
                <td className="text-ink-3">{u.digest_enabled ? 'e-mail uključen' : 'bez e-maila'}</td>
                <td className="text-right text-ink-3">{u.last_login_at ? ago(u.last_login_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </div>
  );
}

function UnmatchedRow({ o, onMatch }: { o: Unmatched; onMatch: (setNum: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2">
      <ShopDot shop={o.shop_id} />
      <div className="min-w-0 flex-1">
        <a href={o.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold hover:underline">
          {o.title}
        </a>
        <div className="text-xs text-ink-3">
          {shopName(o.shop_id)}
          {o.seller && ` · ${o.seller}`} · {rsd(o.price_rsd)}
        </div>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onMatch(v.trim());
        }}
      >
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="npr. 60384"
          className="tabular h-9 w-28 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-ink"
        />
        <Button size="sm" variant="outline" type="submit">
          {t('admin.match')}
        </Button>
      </form>
    </div>
  );
}
