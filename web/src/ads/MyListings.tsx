import { Link } from 'react-router';
import { Button, EmptyState, Spinner, buttonClasses } from '../components/ui';
import { t } from '../i18n';
import { usePageTitle } from '../lib/title';
import { AdCard } from './AdCard';
import { useState } from 'react';
import { useAdActions, useMyAds, type Listing } from './store';

function PriceEditor({ l }: { l: Listing }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(String(l.price_rsd));
  const actions = useAdActions();
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
        if (Number(v) > 0) void actions.setPrice(l.id, Number(v));
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
  const q = useMyAds();
  const mine = q.data ?? [];
  const actions = useAdActions();
  const left = (l: Listing) => (l.expires_at ? Math.max(0, Math.ceil((+new Date(l.expires_at) - Date.now()) / 86_400_000)) : 30);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('ads.mine.title')} <span className="text-ink-3">· {mine.length}</span></h1>
        <Link to="/oglasi/novi" className={buttonClasses('primary')}>+ {t('ads.post')}</Link>
      </div>
      {q.isLoading ? (
        <div className="grid min-h-[30vh] place-items-center"><Spinner className="h-8 w-8" /></div>
      ) : mine.length ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {mine.map((l) => (
            <AdCard
              key={l.id}
              l={l}
              footer={
                <div className="grid gap-1.5 border-t border-line p-3">
                  <p className="text-xs text-ink-3">{t('ads.detail.views', { n: l.views })} · {l.status === 'expired' ? t('ads.mine.expired') : l.status === 'sold' ? t('ads.mine.soldLabel') : l.status === 'paused' ? t('ads.mine.pausedLabel') : t('ads.mine.expires', { n: Math.max(1, left(l)) })}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Link to={`/oglasi/${l.id}/izmeni`} className={buttonClasses('outline', 'sm')}>{t('ads.edit.link')}</Link>
                    <PriceEditor l={l} />
                    <Button size="sm" variant="outline" onClick={() => void actions.setStatus(l.id, l.status === 'paused' ? 'active' : 'paused')} disabled={l.status === 'sold' || l.status === 'expired'}>{l.status === 'paused' ? t('ads.mine.resume') : t('ads.mine.pause')}</Button>
                    {(l.status === 'active' || l.status === 'expired') && <Button size="sm" variant="outline" onClick={() => void actions.renew(l.id)}>{t('ads.mine.renew')}</Button>}
                    {l.status !== 'sold' && <Button size="sm" variant="outline" onClick={() => void actions.setStatus(l.id, 'sold')}>{t('ads.mine.sold')}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(t('ads.mine.confirmDelete'))) void actions.remove(l.id); }}>{t('ads.mine.delete')}</Button>
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
