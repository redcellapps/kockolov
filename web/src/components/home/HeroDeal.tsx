import { Link } from 'react-router';
import { t } from '../../i18n';
import type { Deal, Reason } from '../../lib/api';
import { ago, rsd, shopLabel } from '../../lib/format';
import { ClockIcon, TagIcon, TrendDown } from '../icons';
import { ProductImage } from '../SetCard';
import { ShopDot, cx } from '../ui';

interface Row {
  key: string;
  shop: string;
  label: string;
  price: number;
  best?: boolean;
}

/** Best offer, the next cheapest one and the LEGO Store price, for the comparison bars. */
function comparisonRows(d: Deal): Row[] {
  const rows: Row[] = [];
  if (d.best_shop) rows.push({ key: 'best', shop: d.best_shop, label: shopLabel(d.best_shop, d.best_seller), price: d.best_price_rsd, best: true });
  const next = d.reasons.find((r): r is Extract<Reason, { type: 'vs_next' }> => r.type === 'vs_next');
  if (next) rows.push({ key: 'next', shop: next.shop, label: shopLabel(next.shop, next.seller), price: d.best_price_rsd + next.amount });
  const ref = d.reference_price_rsd;
  if (ref && ref > d.best_price_rsd && !rows.some((r) => r.shop === 'lstore' && r.price === ref)) {
    rows.push({ key: 'lstore', shop: 'lstore', label: t('card.rrp'), price: ref });
  }
  return rows;
}

/**
 * The day's best deal in the hero: picture, price against the LEGO Store price, savings and a
 * small price comparison. Compact side-by-side layout on phones and tablets, tall card on desktop.
 */
export function HeroDeal({ d, updated }: { d: Deal; updated?: string | null }) {
  const ref = d.reference_price_rsd;
  const saving = ref && ref > d.best_price_rsd ? ref - d.best_price_rsd : 0;
  const pct = saving && ref ? Math.round((100 * saving) / ref) : 0;
  const rows = comparisonRows(d);
  const max = Math.max(...rows.map((r) => r.price), d.best_price_rsd);

  return (
    <article className="group relative overflow-hidden rounded-3xl border-2 border-hero-ink bg-hero-paper text-hero-ink shadow-[5px_5px_0_0_var(--hero-ink)] transition hover:-translate-y-0.5 focus-within:-translate-y-0.5">
      <div className="flex items-center justify-between gap-3 bg-hero-ink px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-brand">
          <TagIcon size={16} /> {t('home.top.label')}
        </span>
        {pct >= 3 && (
          <span className="tabular rounded-lg bg-hero-red px-2 py-0.5 text-sm font-extrabold text-white">
            <span aria-hidden>−{pct}%</span>
            <span className="sr-only">{t('home.top.discount', { pct })}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-1">
        <ProductImage
          src={d.image_url}
          alt=""
          className="aspect-square border-r border-hero-line lg:aspect-[16/10] lg:border-b lg:border-r-0"
        />
        <div className="min-w-0 p-4 lg:p-5">
          <p className="text-xs font-semibold text-hero-muted">
            {d.set_num}
            {d.theme_name ? ` · ${d.theme_name}` : ''}
          </p>
          <h2 className="mt-0.5 line-clamp-2 text-base font-extrabold leading-snug sm:text-lg">
            {/* the title link covers the whole card */}
            <Link to={`/set/${d.set_num}`} className="outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-hero-ink">
              {d.name}
            </Link>
          </h2>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="tabular whitespace-nowrap text-2xl font-extrabold tracking-tight text-hero-red lg:text-3xl">{rsd(d.best_price_rsd)}</span>
            {saving > 0 && (
              <span className="tabular whitespace-nowrap text-sm text-hero-muted">
                <span className="sr-only">{t('home.top.was')} </span>
                <s>{rsd(ref)}</s>
              </span>
            )}
          </p>
          {saving > 0 && (
            <p className="mt-1.5 inline-flex items-start gap-1 text-sm font-bold text-hero-green">
              <TrendDown size={16} className="mt-0.5 shrink-0" /> {t('home.top.saving', { amount: rsd(saving) })}
            </p>
          )}
        </div>
      </div>

      {rows.length > 1 && (
        <div className="border-t border-hero-line px-4 py-3 lg:px-5">
          <h3 className="sr-only">{t('home.top.compare')}</h3>
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ShopDot shop={r.shop} />
                  <span className={cx('truncate', r.best ? 'font-bold' : 'text-hero-muted')}>{r.label}</span>
                  {r.best && (
                    <span className="shrink-0 rounded-md bg-hero-green-soft px-1.5 py-px text-[11px] font-extrabold text-hero-green">
                      {t('set.offers.cheapest')}
                    </span>
                  )}
                </span>
                <span className={cx('tabular whitespace-nowrap', r.best ? 'font-extrabold' : 'font-semibold text-hero-muted')}>{rsd(r.price)}</span>
                <span aria-hidden className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-hero-ink/[0.07]">
                  <span
                    className={cx('block h-full rounded-full', r.best ? 'bg-hero-green' : 'bg-hero-ink/30')}
                    style={{ width: `${Math.max(6, Math.round((100 * r.price) / max))}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {updated && (
        <p className="flex items-center gap-1.5 border-t border-hero-line px-4 py-2 text-xs font-medium text-hero-muted lg:px-5">
          <ClockIcon size={14} /> {t('home.stats.updated', { when: ago(updated) })}
        </p>
      )}
    </article>
  );
}

/** Same footprint as the card while deals load, so the hero doesn't jump. */
export function HeroDealSkeleton() {
  return (
    <div className="h-48 animate-pulse rounded-3xl border-2 border-hero-ink/15 bg-hero-paper/50 lg:h-[34rem]" aria-hidden />
  );
}
