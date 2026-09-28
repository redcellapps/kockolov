import { Link } from 'react-router';
import { t, tn } from '../i18n';
import type { Deal, SetSummary } from '../lib/api';
import { ageLabel, reasonText, rsd, shopLabel } from '../lib/format';
import { CheckIcon } from './icons';
import { ShopDot, cx } from './ui';
import { WatchButton } from './WatchButton';

export function ProductImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return (
    <div className={cx('product-img relative flex items-center justify-center overflow-hidden', className)}>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-4 transition duration-300 group-hover:scale-[1.04]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      ) : (
        <span className="text-sm font-bold text-neutral-400">LEGO®</span>
      )}
    </div>
  );
}

function DiscountBadge({ pct }: { pct: number }) {
  if (pct < 3) return null;
  return (
    <span className="absolute left-3 top-3 z-10 rounded-lg bg-deal px-2 py-1 text-[13px] font-extrabold leading-none text-white shadow-sm">
      −{pct}%
    </span>
  );
}

export function SetCard({ s }: { s: SetSummary }) {
  const price = s.best_price ?? s.any_price;
  const inStock = s.best_price !== null;
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link to={`/set/${s.set_num}`} className="flex flex-1 flex-col" aria-label={`${s.set_num} ${s.name}`}>
        <div className="relative">
          <DiscountBadge pct={s.discount_pct} />
          <ProductImage src={s.image_url} alt={s.name} className="aspect-square" />
          {s.deal_rank && s.deal_rank <= 10 && (
            <span className="absolute bottom-3 left-3 rounded-full bg-ink px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-bg">
              {t('set.dealToday', { rank: s.deal_rank })}
            </span>
          )}
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
            {s.age_min ? <span className="ml-auto shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px]">{ageLabel(s.age_min)}</span> : null}
          </div>
          <h3 className="mt-1 line-clamp-2 min-h-[2.6em] text-[15px] font-bold leading-snug">{s.name}</h3>
          <div className="mt-auto pt-3">
            {inStock ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={cx(
                      'tabular whitespace-nowrap text-lg font-extrabold tracking-tight sm:text-xl',
                      s.discount_pct >= 3 ? 'text-deal' : 'text-ink',
                    )}
                  >
                    {rsd(price)}
                  </span>
                  {s.rrp_rsd && s.best_price !== null && s.rrp_rsd > s.best_price && (
                    <span className="tabular whitespace-nowrap text-[13px] text-ink-3 line-through">{rsd(s.rrp_rsd)}</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-2">
                  {s.best_shop && <ShopDot shop={s.best_shop} />}
                  <span className="truncate">{shopLabel(s.best_shop, s.best_seller)}</span>
                  {s.offers_in_stock > 1 && (
                    <span className="ml-auto shrink-0 text-ink-3">{tn('card.offers', s.offers_in_stock)}</span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="tabular whitespace-nowrap text-lg font-extrabold tracking-tight text-ink-3 sm:text-xl">{rsd(price)}</div>
                <div className="mt-1 text-[13px] text-ink-3">{t('card.outOfStock')}</div>
              </>
            )}
          </div>
        </div>
      </Link>
      <WatchButton setNum={s.set_num} compact className="absolute right-3 top-3 z-10" />
    </div>
  );
}

export function DealCard({ d }: { d: Deal }) {
  const pct = d.reference_price_rsd && d.reference_price_rsd > d.best_price_rsd
    ? Math.round((100 * (d.reference_price_rsd - d.best_price_rsd)) / d.reference_price_rsd)
    : 0;
  const reasons = d.reasons.map(reasonText).filter(Boolean).slice(0, 2);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link to={`/set/${d.set_num}`} className="flex flex-1 flex-col">
        <div className="relative">
          <span className="absolute left-3 top-3 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-ink px-2 text-sm font-extrabold text-bg">
            {d.rank}
          </span>
          {pct >= 3 && (
            <span className="absolute left-3 bottom-3 z-10 rounded-lg bg-deal px-2 py-1 text-[13px] font-extrabold leading-none text-white">
              −{pct}%
            </span>
          )}
          <ProductImage src={d.image_url} alt={d.name} className="aspect-[4/3]" />
        </div>
        <div className="flex flex-1 flex-col border-t border-line p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
            <span className="tabular">{d.set_num}</span>
            {d.theme_name && (
              <>
                <span>·</span>
                <span className="truncate">{d.theme_name}</span>
              </>
            )}
          </div>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug">{d.name}</h3>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className="tabular whitespace-nowrap text-xl font-extrabold tracking-tight text-deal sm:text-2xl">{rsd(d.best_price_rsd)}</span>
            {d.reference_price_rsd && d.reference_price_rsd > d.best_price_rsd && (
              <span className="tabular whitespace-nowrap text-[13px] text-ink-3 line-through">{rsd(d.reference_price_rsd)}</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-2">
            {d.best_shop && <ShopDot shop={d.best_shop} />}
            <span className="truncate">{shopLabel(d.best_shop, d.best_seller)}</span>
          </div>
          {reasons.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-dashed border-line pt-3">
              {reasons.map((r, i) => (
                <li key={r} className={cx('items-start gap-1.5 text-[13px] font-medium text-save', i > 0 ? 'hidden sm:flex' : 'flex')}>
                  <CheckIcon size={15} className="mt-0.5 shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Link>
      <WatchButton setNum={d.set_num} compact className="absolute right-3 top-3 z-10" />
    </div>
  );
}
