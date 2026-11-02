import { useLocation, useNavigate } from 'react-router';
import { t } from '../i18n';
import { HeartIcon } from '../components/icons';
import { cx } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useAdActions, type Listing } from './store';

export function AdWatchHeart({ l, className }: { l: Listing; className?: string }) {
  const on = l.watched;
  const { user } = useAuth();
  const actions = useAdActions();
  const nav = useNavigate();
  const loc = useLocation();
  if (l.mine) return null; // you can't follow your own ad
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t('ads.detail.following') : t('ads.detail.follow')}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) return nav('/prijava', { state: { from: loc.pathname + loc.search } });
        void actions.watch(l.id, !on).catch(() => {});
      }}
      className={cx('grid h-9 w-9 place-items-center rounded-full bg-surface/90 shadow-sm backdrop-blur transition hover:scale-105', on ? 'text-deal' : 'text-ink-2', className)}
    >
      <HeartIcon size={18} filled={on} />
    </button>
  );
}
