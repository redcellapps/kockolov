import { Link } from 'react-router';
import { t } from '../i18n';
import { ago, money } from '../lib/format';
import { cx } from '../components/ui';
import { type Listing } from './store';

export const condTone = (c: Listing['condition']) =>
  c === 'new_sealed' ? 'bg-save-soft text-save' : c === 'new_opened' ? 'bg-[#e8f0fd] text-accent' : c === 'parts' ? 'bg-surface-2 text-ink-2' : 'bg-[#fff4cf] text-[#7a5a00]';

export function CondBadge({ c, className }: { c: Listing['condition']; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide', condTone(c), className)}>{t(`cond.${c}`)}</span>;
}

export const adAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? t('ads.today') : t('ads.ago', { when: ago(iso).replace(/^pre\s+/, '') });
};

export function AdCard({ l, footer }: { l: Listing; footer?: React.ReactNode }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link to={`/oglasi/${l.id}`} className="flex flex-1 flex-col" aria-label={l.title}>
        <div className="relative aspect-square bg-surface-2">
          <img src={l.images[0]} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          <CondBadge c={l.condition} className="absolute left-3 top-3 shadow-sm" />
          {l.status !== 'active' && (
            <span className="absolute inset-0 grid place-items-center bg-ink/55 text-sm font-extrabold uppercase tracking-wide text-bg">
              {l.status === 'sold' ? t('ads.detail.sold') : t('ads.detail.paused')}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 border-t border-line p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
            {l.set_num && <span className="tabular">{l.set_num}</span>}
            {l.set_num && l.theme_name && <span>·</span>}
            {l.theme_name && <span className="truncate">{l.theme_name}</span>}
          </div>
          <h3 className="line-clamp-2 text-[15px] font-bold leading-snug">{l.title}</h3>
          <div className="mt-auto pt-2">
            <div className="tabular text-xl font-extrabold">{money(l.price_rsd)}</div>
            <div className="mt-0.5 flex items-center justify-between text-xs text-ink-3">
              <span className="truncate">{l.city}</span>
              <span>{adAgo(l.created_at)}</span>
            </div>
          </div>
        </div>
      </Link>
      {footer}
    </div>
  );
}
