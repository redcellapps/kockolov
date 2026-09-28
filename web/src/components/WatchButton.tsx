import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from '../i18n';
import { api, type SetSummary } from '../lib/api';
import { useAuth } from '../lib/auth';
import { HeartIcon } from './icons';
import { cx } from './ui';

/** Shared watchlist state (one request, reused by every card). */
export function useWatchlist() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => api<{ items: SetSummary[] }>('/api/me/watchlist'),
    enabled: !!user,
    staleTime: 60_000,
  });
  const nums = new Set((q.data?.items ?? []).map((i) => i.set_num));
  return { ...q, nums };
}

export function WatchButton({ setNum, compact, className }: { setNum: string; compact?: boolean; className?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { nums } = useWatchlist();
  const watched = nums.has(setNum);
  const m = useMutation({
    mutationFn: (next: boolean) => api(`/api/me/watchlist/${setNum}`, { method: next ? 'PUT' : 'DELETE' }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['watchlist'] });
      void qc.invalidateQueries({ queryKey: ['set', setNum] });
    },
  });
  if (!user) return null;
  const on = m.isPending ? !!m.variables : watched;
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => m.mutate(!on)}
        aria-pressed={on}
        aria-label={on ? t('set.watching') : t('set.watch')}
        title={on ? t('set.watching') : t('set.watch')}
        className={cx(
          'grid h-9 w-9 place-items-center rounded-full border shadow-sm backdrop-blur transition cursor-pointer',
          on ? 'border-deal/30 bg-deal text-white' : 'border-black/5 bg-white/90 text-neutral-500 hover:text-deal',
          className,
        )}
      >
        <HeartIcon size={17} filled={on} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => m.mutate(!on)}
      aria-pressed={on}
      className={cx(
        'inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-[15px] font-bold transition cursor-pointer',
        on ? 'border-deal bg-deal-soft text-deal' : 'border-line bg-surface text-ink hover:border-ink-3',
        className,
      )}
    >
      <HeartIcon size={18} filled={on} />
      {on ? t('set.watching') : t('set.watch')}
    </button>
  );
}
