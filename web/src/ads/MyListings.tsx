import { Link } from 'react-router';
import { Button, EmptyState, buttonClasses } from '../components/ui';
import { t } from '../i18n';
import { usePageTitle } from '../lib/title';
import { AdCard } from './AdCard';
import { ProtoBanner } from './ListingsPage';
import { removeListing, updateListing, useListings } from './store';

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
