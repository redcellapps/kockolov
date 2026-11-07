import { ExternalIcon } from './icons';
import { ShopDot } from './ui';
import { t } from '../i18n';
import { promoFacts, type Promo } from '../lib/promos';

/** A promotion a shop is running: what it is, the conditions, and where the shop describes it. */
export function PromoCard({ p }: { p: Promo }) {
  const facts = promoFacts(p);
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-sm">
        <ShopDot shop={p.shop_id} />
        <span className="font-bold">{p.shop_name}</span>
        <span className="rounded-md bg-brand/20 px-1.5 py-0.5 text-[11px] font-extrabold uppercase">{t(`promo.kind.${p.kind}`)}</span>
      </div>
      <h3 className="text-lg font-extrabold leading-snug">{p.title}</h3>
      {p.details && <p className="text-sm text-ink-2">{p.details}</p>}
      {facts.length > 0 && <p className="text-sm font-semibold text-ink">{facts.join(' · ')}</p>}
      <a href={p.source_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-bold underline">
        {t('promo.source')} <ExternalIcon size={14} />
      </a>
    </article>
  );
}
