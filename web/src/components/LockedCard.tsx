import { Link } from 'react-router';
import { t } from '../i18n';
import type { LockedSet } from '../lib/api';
import { ProductImage } from './SetCard';

/** A set sold only by members-only shops: name and picture are shown, number and price are hidden behind sign-up. */
export function LockedCard({ s }: { s: LockedSet }) {
  return (
    <Link
      to="/registracija"
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lift"
      aria-label={`${s.name} — ${t('locked.cta')}`}
    >
      <div className="relative">
        <ProductImage src={s.image_url} alt={s.name} className="aspect-square" />
        <span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-ink text-base text-bg shadow-lift" aria-hidden="true">🔒</span>
      </div>
      <div className="flex flex-1 flex-col border-t border-line p-4">
        <div aria-hidden="true">
          <div className="h-3 w-24 rounded bg-surface-2" />
        </div>
        <h3 className="mt-2 line-clamp-2 text-[15px] font-bold leading-snug">{s.name}</h3>
        <div className="mt-2" aria-hidden="true">
          <div className="h-6 w-1/2 rounded bg-surface-2" />
        </div>
        <p className="mt-3 text-xs font-semibold text-ink-3">{t('locked.price')}</p>
        <span className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-xl bg-brand text-[13px] font-extrabold">{t('locked.cta')}</span>
      </div>
    </Link>
  );
}
