import { Button } from '../components/ui';
import { t } from '../i18n';
import { useAuth } from '../lib/auth';
import { dateLong } from '../lib/format';
import { useAdActions, useBlocks } from './store';

/** Account page: people I blocked (from an ad or a conversation), with "Odblokiraj" */
export function BlockedCard() {
  const { user, listings } = useAuth();
  const q = useBlocks(!!user && listings);
  const actions = useAdActions();
  const items = q.data ?? [];
  if (!listings || !user || !items.length) return null;
  return (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
      <h2 className="mb-1 text-lg font-extrabold">{t('block.title')}</h2>
      <p className="mb-4 text-sm text-ink-3">{t('block.text')}</p>
      <ul className="divide-y divide-line">
        {items.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate font-bold">{b.name}</div>
              <div className="text-xs text-ink-3">{t('block.since', { date: dateLong(b.since) })}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => void actions.unblock(b.id)}>{t('block.unblock')}</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
