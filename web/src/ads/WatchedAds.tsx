import { Link } from 'react-router';
import { Button, buttonClasses, EmptyState } from '../components/ui';
import { t } from '../i18n';
import { money } from '../lib/format';
import { AdCard } from './AdCard';
import { ackWatch, noticesFor, toggleWatch, useListings, useWatches } from './store';

/** The "Oglasi" tab of Praćeno: followed ads, with a notice when the price changed or the ad was sold */
export default function WatchedAds() {
  const all = useListings();
  const w = useWatches();
  const items = all.filter((l) => w[l.id]);
  const notices = noticesFor(all, w);
  return (
    <div>
      <h2 className="text-xl font-extrabold">{t('ads.watch.title')}</h2>
      <p className="mt-1 text-sm text-ink-2">{t('ads.watch.subtitle')} {t('ads.watch.push')}</p>
      {notices.length > 0 && (
        <ul className="mt-5 space-y-2">
          {notices.map((n) => (
            <li key={n.listing.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${n.kind === 'drop' ? 'border-save/30 bg-save-soft' : 'border-line bg-surface-2'}`}>
              <span className="text-xl" aria-hidden>{n.kind === 'drop' ? '📉' : n.kind === 'sold' ? '🏷️' : '📈'}</span>
              <div className="min-w-0 flex-1 text-sm">
                <Link to={`/oglasi/${n.listing.id}`} className="block truncate font-extrabold hover:underline">{n.listing.title}</Link>
                <span className="font-semibold text-ink-2">
                  {n.kind === 'sold' ? t('ads.watch.sold') : t(n.kind === 'drop' ? 'ads.watch.drop' : 'ads.watch.rise', { from: money(n.from), to: money(n.listing.price_rsd) })}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => ackWatch(n.listing)}>{t('ads.watch.ack')}</Button>
            </li>
          ))}
        </ul>
      )}
      {items.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((l) => (
            <AdCard key={l.id} l={l} footer={<div className="border-t border-line p-2"><Button size="sm" variant="ghost" className="w-full" onClick={() => toggleWatch(l)}>{t('ads.watch.unfollow')}</Button></div>} />
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState title={t('ads.watch.empty')} text={t('ads.watch.emptyText')} action={<Link to="/oglasi" className={buttonClasses('primary')}>{t('ads.title')}</Link>} />
        </div>
      )}
    </div>
  );
}
