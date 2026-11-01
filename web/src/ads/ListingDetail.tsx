import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, EmptyState } from '../components/ui';
import { t } from '../i18n';
import { api, type SetDetail } from '../lib/api';
import { dateLong, money } from '../lib/format';
import { usePageTitle } from '../lib/title';
import { AdCard, CondBadge, adAgo } from './AdCard';
import { ProtoBanner } from './ListingsPage';
import { conversationFor, sendMessage } from './messages';
import { priceChange, toggleWatch, updateListing, useListings, useWatches } from './store';

export default function ListingDetail() {
  const { id } = useParams();
  const all = useListings();
  const l = all.find((x) => x.id === id);
  usePageTitle(l?.title ?? t('ads.detail.notFound'));
  const [img, setImg] = useState(0);
  const [phone, setPhone] = useState(false);
  const [msg, setMsg] = useState('');
  const nav = useNavigate();
  const [reported, setReported] = useState(false);
  const following = !!useWatches()[id ?? ''];

  useEffect(() => {
    if (id) updateListing(id, { views: (all.find((x) => x.id === id)?.views ?? 0) + 1 });
    // count one view per opened page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = useQuery({
    queryKey: ['set', l?.set_num],
    queryFn: () => api<SetDetail>(`/api/sets/${encodeURIComponent(l!.set_num!)}`),
    enabled: !!l?.set_num,
    retry: false,
  });
  const shopMin = set.data?.offers.filter((o) => o.in_stock).reduce<number | null>((m, o) => (m === null || o.price_rsd < m ? o.price_rsd : m), null) ?? null;

  if (!l) return <div className="mx-auto max-w-3xl px-4 py-12"><EmptyState title={t('ads.detail.notFound')} action={<Link to="/oglasi" className="font-bold underline">{t('ads.detail.back')}</Link>} /></div>;

  const cmp = shopMin ? Math.round((1 - l.price_rsd / shopMin) * 100) : null;
  const more = all.filter((x) => x.id !== l.id && x.status === 'active' && (x.theme_slug === l.theme_slug || x.seller === l.seller)).slice(0, 4);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm last:border-0">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <ProtoBanner />
      <Link to="/oglasi" className="text-sm font-bold text-ink-2 hover:text-ink">← {t('ads.detail.back')}</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-2">
            <img src={l.images[img]} alt={l.title} className="aspect-[4/3] w-full object-cover" />
            <CondBadge c={l.condition} className="absolute left-4 top-4 shadow-sm" />
          </div>
          {l.images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {l.images.map((src, i) => (
                <button key={i} onClick={() => setImg(i)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${i === img ? 'border-ink' : 'border-transparent opacity-70'}`}>
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <h2 className="mt-8 text-lg font-extrabold">{t('ads.detail.description')}</h2>
          <p className="mt-2 whitespace-pre-line text-ink-2">{l.description || '—'}</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-surface p-6">
            <p className="text-xs font-semibold text-ink-3">{t('ads.detail.posted', { when: adAgo(l.created_at) })} · {t('ads.detail.views', { n: l.views })}</p>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight">{l.title}</h1>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="tabular text-3xl font-extrabold">{money(l.price_rsd)}</span>
              {priceChange(l) && <span className="tabular text-base font-bold text-ink-3 line-through">{money(priceChange(l))}</span>}
            </div>
            <p className="text-sm font-semibold text-ink-3">{l.negotiable ? t('ads.negotiable') : t('ads.fixed')}</p>
            {priceChange(l) && <p className="mt-2 inline-block rounded-lg bg-save-soft px-2.5 py-1 text-xs font-extrabold text-save">{t('ads.detail.priceDrop', { price: money(priceChange(l)) })}</p>}
            <Button variant={following ? 'dark' : 'outline'} size="sm" className="mt-3 w-full" onClick={() => toggleWatch(l)}>
              {following ? '♥ ' + t('ads.detail.following') : '♡ ' + t('ads.detail.follow')}
            </Button>
            {cmp !== null && shopMin && (
              <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${cmp > 0 ? 'bg-save-soft text-save' : 'bg-surface-2 text-ink-2'}`}>
                {cmp > 0 ? t('ads.cheaperThanShops', { pct: cmp }) : t('ads.pricierThanShops')} · {t('ads.shopsFrom', { price: money(shopMin) })}
              </p>
            )}
            <dl className="mt-4">
              {l.set_num && row(t('ads.detail.set'), <Link className="underline" to={`/set/${l.set_num}`}>{l.set_num}</Link>)}
              {row(t('ads.detail.condition'), t(`cond.${l.condition}`))}
              {row(t('ads.detail.box'), l.has_box ? t('ads.detail.yes') : t('ads.detail.no'))}
              {row(t('ads.detail.manual'), l.has_manual ? t('ads.detail.yes') : t('ads.detail.no'))}
              {l.theme_name && row(t('ads.detail.theme'), l.theme_name)}
              {l.year && row(t('ads.detail.year'), l.year)}
              {l.pieces && row(t('ads.detail.pieces'), l.pieces.toLocaleString('sr-RS'))}
              {l.minifigs !== null && row(t('ads.detail.minifigs'), l.minifigs)}
              {row(t('ads.detail.city'), l.city)}
              {row(t('ads.detail.shipping'), t(`ship.${l.shipping}`))}
            </dl>
          </div>

          <div className="rounded-3xl border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-lg font-extrabold">{l.seller[0]}</span>
              <div>
                <div className="font-extrabold">{l.seller}</div>
                <div className="text-xs text-ink-3">{t('ads.detail.memberSince', { date: dateLong(l.seller_since) })}</div>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {l.seller_phone ? (
                phone ? (
                  <a href={`tel:${l.seller_phone.replace(/\s/g, '')}`} className="flex h-11 items-center justify-center rounded-xl bg-ink text-[15px] font-bold text-bg">📞 {l.seller_phone}</a>
                ) : (
                  <Button variant="dark" onClick={() => setPhone(true)}>📞 {t('ads.detail.showPhone')}</Button>
                )
              ) : (
                <p className="text-sm text-ink-3">{t('ads.detail.noPhone')}</p>
              )}
              {l.mine ? (
                <Link to="/poruke" className="flex h-11 items-center justify-center rounded-xl border border-line text-[15px] font-bold hover:border-ink-3">{t('msg.myAdInbox')}</Link>
              ) : (
                <>
                  <textarea rows={3} className="w-full rounded-xl border border-line bg-surface p-3 text-sm outline-none focus:border-ink" placeholder={t('ads.detail.messagePlaceholder')} value={msg} onChange={(e) => setMsg(e.target.value)} />
                  <Button
                    disabled={!msg.trim()}
                    onClick={() => {
                      const cid = conversationFor(l);
                      sendMessage(cid, msg);
                      nav(`/poruke/${cid}`);
                    }}
                  >
                    {t('ads.detail.message')}
                  </Button>
                </>
              )}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">{t('ads.detail.safety')}</p>
            <div className="mt-3 flex gap-4 text-xs font-bold">
              <button className="text-ink-2 underline" onClick={() => setReported(true)}>{reported ? t('ads.detail.reported') : t('ads.detail.report')}</button>
            </div>
          </div>

          {l.set_num && shopMin && (
            <div className="rounded-3xl border border-line bg-surface-2 p-6">
              <h3 className="font-extrabold">{t('ads.detail.compare')}</h3>
              <p className="mt-1 text-sm text-ink-2">{t('ads.detail.compareText', { price: money(shopMin) })}</p>
              <Link className="mt-2 inline-block text-sm font-bold underline" to={`/set/${l.set_num}`}>{t('ads.detail.compareLink')} →</Link>
            </div>
          )}
        </div>
      </div>

      {more.length > 0 && (
        <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
          {more.map((x) => <AdCard key={x.id} l={x} />)}
        </div>
      )}
    </div>
  );
}
