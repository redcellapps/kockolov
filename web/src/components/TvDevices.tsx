import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button, buttonClasses } from './ui';
import { t } from '../i18n';
import { api } from '../lib/api';
import { dateLong } from '../lib/format';

interface Device {
  id: number;
  kind: 'tv' | 'app';
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

/** Account card: link to pair a TV, and the TVs/phones signed in with a token, each removable. */
export function TvDevicesCard() {
  const qc = useQueryClient();
  const devices = useQuery({ queryKey: ['me', 'devices'], queryFn: () => api<{ devices: Device[] }>('/api/me/devices') });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/me/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'devices'] }),
  });
  const list = devices.data?.devices ?? [];
  return (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
      <h2 className="mb-4 text-lg font-extrabold">{t('account.tv')}</h2>
      <p className="text-sm text-ink-2">{t('account.tv.intro')}</p>
      <Link to="/tv" className={buttonClasses('dark', 'md', 'mt-4')}>
        {t('account.tv.pair')}
      </Link>
      <h3 className="mt-6 text-sm font-bold">{t('account.tv.devices')}</h3>
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{t('account.tv.none')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {list.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-semibold">{d.device_name || t(d.kind === 'tv' ? 'account.tv.kind.tv' : 'account.tv.kind.app')}</div>
                <div className="text-xs text-ink-3">
                  {t('account.tv.since', { date: dateLong(d.created_at) })}
                  {d.last_used_at ? ` · ${t('account.tv.lastUsed', { date: dateLong(d.last_used_at) })}` : ''}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => remove.mutate(d.id)} disabled={remove.isPending}>
                {t('account.tv.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
