import { t } from '../i18n';
import { HeartIcon } from '../components/icons';
import { cx } from '../components/ui';
import { toggleWatch, useWatches, type Listing } from './store';

export function AdWatchHeart({ l, className }: { l: Listing; className?: string }) {
  const on = !!useWatches()[l.id];
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t('ads.detail.following') : t('ads.detail.follow')}
      onClick={(e) => (e.preventDefault(), e.stopPropagation(), toggleWatch(l))}
      className={cx('grid h-9 w-9 place-items-center rounded-full bg-surface/90 shadow-sm backdrop-blur transition hover:scale-105', on ? 'text-deal' : 'text-ink-2', className)}
    >
      <HeartIcon size={18} filled={on} />
    </button>
  );
}
