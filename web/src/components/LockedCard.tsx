import { Link } from 'react-router';
import { t } from '../i18n';
import type { LockedSet } from '../lib/api';
import { ProductImage } from './SetCard';

/** A set that is only sold by members-only shops: image and price are blurred, the card leads to sign-up. */
export function LockedCard({ s }: { s: LockedSet }) {
  return (
    <Link
      to="/registracija"
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lift"
      aria-label={`${s.set_num} ${s.name} — ${t('locked.cta')}`}
    >
      <div className="relative">
        <div className="blur-md" aria-hidden="true">
          <ProductImage src={s.image_url} alt="" className="aspect-square" />
        </div>
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-xl text-bg shadow-lift" aria-hidden="true">🔒</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col border-t border-line p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
          <span className="tabular">{s.set_num}</span>
          {s.theme_name && (
            <>
              <span>·</span>
              <span className="truncate">{s.theme_name}</span>
            </>
          )}
        </div>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug">{s.name}</h3>
        <div className="mt-auto pt-3">
          <div className="select-none text-xl font-extrabold blur-sm" aria-hidden="true">00.000 RSD</div>
          <p className="mt-1 text-xs font-semibold text-ink-3">{t('locked.price')}</p>
          <span className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-xl bg-brand text-[13px] font-extrabold">{t('locked.cta')}</span>
        </div>
      </div>
    </Link>
  );
}
