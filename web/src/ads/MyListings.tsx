import { Link } from 'react-router';
import { Button, EmptyState, buttonClasses } from '../components/ui';
import { t } from '../i18n';
import { usePageTitle } from '../lib/title';
import { AdCard } from './AdCard';
import { ProtoBanner } from './ListingsPage';
import { useState } from 'react';
import { changePrice, removeListing, updateListing, useListings, type Listing } from './store';

function PriceEditor({ l }: { l: Listing }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(String(l.price_rsd));
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t('ads.mine.changePrice')}
      </Button>
    );
  return (
    <form
      className="flex w-full gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number(v) > 0) changePrice(l.id, Number(v));
        setOpen(false);
      }}
    >
      <input autoFocus className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-ink" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} />
      <Button size="sm" type="submit">{t('ads.mine.savePrice')}</Button>
    </form>
  );
}

export default function MyListings() {
  usePageTitle(t('title.myAds'));
  const mine = useListings().filter((l) => l.mine);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <ProtoBanner />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('ads.mine.title')} <span className="text-ink-3">· {mine.length}</span></h1>
        <Link to="/oglasi/novi" className={buttonClasses('primary')}>+ {t('ads.post')}</Link>
      </div>
      {mine.length ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {mine.map((l) => (
            <AdCard
              key={l.id}
              l={l}
              footer={
                <div className="grid gap-1.5 border-t border-line p-3">
                  <p className="text-xs text-ink-3">{t('ads.detail.views', { n: l.views })} · {t('ads.mine.expires', { n: Math.max(1, 30 - Math.floor((Date.now() - +new Date(l.created_at)) / 86_400_000)) })}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Link to={`/oglasi/${l.id}/izmeni`} className={buttonClasses('outline', 'sm')}>{t('ads.edit.link')}</Link>
                    <PriceEditor l={l} />
                    <Button size="sm" variant="outline" onClick={() => updateListing(l.id, { status: l.status === 'paused' ? 'active' : 'paused' })}>{l.status === 'paused' ? t('ads.mine.resume') : t('ads.mine.pause')}</Button>
                    <Button size="sm" variant="outline" onClick={() => updateListing(l.id, { status: 'sold' })}>{t('ads.mine.sold')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => removeListing(l.id)}>{t('ads.mine.delete')}</Button>
                  </div>
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState title={t('ads.mine.empty')} text={t('ads.mine.emptyText')} action={<Link to="/oglasi/novi" className={buttonClasses('primary')}>{t('ads.post')}</Link>} />
      )}
    </div>
  );
}
