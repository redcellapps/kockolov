import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, CheckIcon, ExternalIcon, LockIcon, TrendDown } from '../components/icons';
import { PriceHistoryChart } from '../components/PriceHistoryChart';
import { ProductImage, SetCard } from '../components/SetCard';
import { EmptyState, ErrorState, ShopDot, Skeleton, buttonClasses, cx } from '../components/ui';
import { WatchButton } from '../components/WatchButton';
import { t, tn } from '../i18n';
import { api, ApiError, type SetDetail as SetDetailData } from '../lib/api';
import { ageLabel, ago, dateLong, displayCurrency, money, rateText, reasonText, shopName } from '../lib/format';
import { useAuth } from '../lib/auth';
import { usePageTitle } from '../lib/title';

export default function SetDetail() {
  const { setNum = '' } = useParams();
  const navigate = useNavigate();
  const { fx, user } = useAuth();
  const q = useQuery({
    queryKey: ['set', setNum],
    queryFn: () => api<SetDetailData>(`/api/sets/${encodeURIComponent(setNum)}`),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
  const d = q.data;
  const cheapest = d?.offers.find((o) => o.in_stock);
  usePageTitle(
    d
      ? cheapest
        ? t('title.set', { num: d.set.set_num, name: d.set.name, price: money(cheapest.price_rsd) })
        : t('title.setNoPrice', { num: d.set.set_num, name: d.set.name })
      : q.error instanceof ApiError && q.error.status === 404
        ? t('title.notFound')
        : null,
  );

  if (q.isLoading) return <DetailSkeleton />;
  if (q.error instanceof ApiError && q.error.status === 404)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState title={t('set.notFound')} action={<Link to="/pretraga" className="font-bold text-accent">{t('nav.search')}</Link>} />
      </div>
    );
  if (q.isError || !q.data) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState onRetry={() => q.refetch()} /></div>;

  const { set, offers, history, stats, deal, related } = q.data;
  const hidden = q.data.hidden_offers ?? 0;
  const hiddenShops = q.data.hidden_shops ?? 0;
  const inStock = offers.filter((o) => o.in_stock);
  const best = inStock[0] ?? null;
  const rrp = set.rrp_rsd;
  const saving = best && rrp && rrp > best.price_rsd ? rrp - best.price_rsd : 0;
  const savingPct = saving && rrp ? Math.round((100 * saving) / rrp) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex items-center gap-2 text-sm text-ink-3">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 rounded-lg py-1 pr-2 font-semibold hover:text-ink cursor-pointer">
          <ArrowLeft size={16} /> {t('set.backToResults')}
        </button>
        {set.theme_slug && (
          <>
            <span>/</span>
            <Link to={`/pretraga?theme=${set.theme_slug}`} className="font-semibold hover:text-ink">
              {set.theme_name}
            </Link>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
        {/* image */}
        <div className="relative overflow-hidden rounded-3xl border border-line">
          <ProductImage src={set.image_url} alt={set.name} className="aspect-square [&_img]:p-8 sm:[&_img]:p-12" />
          {savingPct >= 3 && (
            <span className="absolute left-4 top-4 rounded-xl bg-deal px-3 py-1.5 text-lg font-extrabold text-white shadow">−{savingPct}%</span>
          )}
          {deal && (
            <span className="absolute bottom-4 left-4 rounded-full bg-ink px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-bg">
              {t('set.dealToday', { rank: deal.rank })}
            </span>
          )}
        </div>

        {/* summary */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-2">
            <span className="tabular rounded-lg bg-surface-2 px-2 py-1">{t('set.number', { num: set.set_num })}</span>
            {set.theme_name && (
              <Link to={`/pretraga?theme=${set.theme_slug}`} className="rounded-lg bg-surface-2 px-2 py-1 hover:text-ink">
                {set.theme_name}
              </Link>
            )}
            {set.age_min ? <span className="rounded-lg bg-surface-2 px-2 py-1">{t('set.age', { age: ageLabel(set.age_min) })}</span> : null}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{set.name}</h1>

          <div className="mt-6 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
            {best ? (
              <>
                <div className="text-sm font-semibold text-ink-3">{t('set.bestPrice')}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={cx('tabular text-4xl font-extrabold tracking-tight', saving ? 'text-deal' : 'text-ink')}>{money(best.price_rsd)}</span>
                  {rrp && rrp > best.price_rsd && <span className="tabular text-lg text-ink-3 line-through">{money(rrp)}</span>}
                </div>
                <div className="mt-2 flex items-center gap-2 text-[15px] text-ink-2">
                  <ShopDot shop={best.shop_id} />
                  {t('set.at')} <b className="text-ink">{shopName(best.shop_id)}</b>
                  {best.seller && <span>· {best.seller}</span>}
                </div>
                {displayCurrency() === 'EUR' && <p className="mt-1.5 text-xs text-ink-3">{t('fx.note', { rate: rateText(fx?.eur.rate) })}</p>}
                {hidden > 0 && (
                  <a href="#ponude" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
                    <LockIcon size={15} /> {tn('members.teaser.offers', hidden)} {tn('members.teaser.shops', hiddenShops)}
                  </a>
                )}
                {saving > 0 && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-save-soft px-3 py-2 text-sm font-bold text-save">
                    <TrendDown size={18} /> {t('set.youSave', { amount: money(saving), pct: savingPct })}
                  </div>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <a
                    href={best.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className={buttonClasses('primary', 'lg', 'min-w-[13rem] flex-1 whitespace-nowrap sm:flex-none')}
                  >
                    {t('set.goToShop')} <ExternalIcon size={18} />
                  </a>
                  <WatchButton setNum={set.set_num} className="h-13" />
                </div>
              </>
            ) : hidden > 0 ? (
              <MembersTeaser n={hidden} shops={hiddenShops} onlyMembers compact />
            ) : (
              <>
                <div className="text-lg font-extrabold">{t('card.outOfStock')}</div>
                <div className="mt-3">
                  <WatchButton setNum={set.set_num} />
                </div>
              </>
            )}
            {deal && deal.reasons.length > 0 && (
              <ul className="mt-5 space-y-1.5 border-t border-dashed border-line pt-4">
                {deal.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm font-medium text-save">
                    <CheckIcon size={16} className="mt-0.5 shrink-0" /> {reasonText(r)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <Stat label={t('set.rrp')} value={rrp ? money(rrp) : '—'} hint={rrp ? undefined : t('set.rrp.unknown')} />
            <Stat label={t('set.lowest30')} value={money(stats?.lowest_30d)} />
            <Stat label={t('set.lowestEver')} value={money(stats?.lowest_ever)} hint={stats?.tracked_since ? t('set.trackedSince', { date: dateLong(stats.tracked_since) }) : undefined} />
          </dl>
        </div>
      </div>

      {/* offers */}
      <section id="ponude" className="mt-12 scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-extrabold tracking-tight">{t('set.offers.title')}</h2>
          {user?.role === 'admin' && (
            <Link to={`/admin/ponude?trazi=${encodeURIComponent(set.set_num)}`} className="text-sm font-bold text-accent hover:underline">
              {t('set.offers.admin')}
            </Link>
          )}
        </div>
        {offers.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <table className="w-full text-left">
              <thead className="hidden border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-ink-3 sm:table-header-group">
                <tr>
                  <th className="px-5 py-3">{t('set.offers.shop')}</th>
                  <th className="px-5 py-3">{t('set.offers.stock')}</th>
                  <th className="px-5 py-3 text-right">{t('set.offers.price')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => {
                  const isBest = best?.id === o.id;
                  return (
                    <tr key={o.id} className={cx('border-b border-line last:border-0', isBest && 'bg-save-soft/60', !o.in_stock && 'opacity-60')}>
                      <td className="px-4 py-4 sm:px-5">
                        <div className="flex items-center gap-2.5">
                          <ShopDot shop={o.shop_id} />
                          <div className="min-w-0">
                            <div className="font-bold">
                              {o.shop_name}
                              {isBest && (
                                <span className="ml-2 rounded-md bg-save px-1.5 py-0.5 align-middle text-[11px] font-extrabold uppercase text-white">
                                  {t('set.offers.cheapest')}
                                </span>
                              )}
                            </div>
                            {o.seller && <div className="truncate text-sm text-ink-2">{o.seller}</div>}
                            <div className="text-xs text-ink-3 sm:hidden">
                              {o.in_stock ? t('set.offers.inStock') : t('set.offers.outOfStock')} · {ago(o.last_seen)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-5 py-4 text-sm sm:table-cell">
                        <span className={cx('font-semibold', o.in_stock ? 'text-save' : 'text-ink-3')}>
                          {o.in_stock
                            ? o.stock_qty
                              ? t('set.offers.inStockQty', { n: o.stock_qty })
                              : t('set.offers.inStock')
                            : t('set.offers.outOfStock')}
                        </span>
                        <div className="text-xs text-ink-3">
                          {t('set.offers.updated')} {ago(o.last_seen)}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right sm:px-5">
                        <div className={cx('tabular text-lg font-extrabold', isBest ? 'text-save' : 'text-ink')}>{money(o.price_rsd)}</div>
                        {o.regular_price_rsd && o.regular_price_rsd > o.price_rsd && (
                          <div className="tabular text-xs text-ink-3">
                            <span className="line-through">{money(o.regular_price_rsd)}</span> {t('set.offers.sale')}
                          </div>
                        )}
                      </td>
                      <td className="w-0 py-4 pr-4 sm:pr-5">
                        <a
                          href={o.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className={cx(
                            'inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition',
                            isBest ? 'bg-brand text-brand-ink hover:bg-brand-2' : 'border border-line hover:border-ink-3',
                          )}
                        >
                          {t('set.offers.buy')} <ExternalIcon size={15} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hidden > 0 && <MembersTeaser n={hidden} shops={hiddenShops} onlyMembers={offers.length === 0} />}
        <p className="mt-3 text-xs text-ink-3">{t('set.disclaimer')}</p>
      </section>

      {/* history */}
      <section className="mt-12">
        <h2 className="mb-1 text-2xl font-extrabold tracking-tight">{t('set.history.title')}</h2>
        <p className="mb-4 text-sm text-ink-3">{t('set.history.legend')}</p>
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <PriceHistoryChart offers={offers} history={history} />
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-extrabold tracking-tight">{t('set.related', { theme: set.theme_name ?? '' })}</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {related.slice(0, 4).map((s) => (
              <SetCard key={s.set_num} s={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** For visitors: offers from members-only shops exist, sign in to see them. */
function MembersTeaser({ n, shops, onlyMembers, compact }: { n: number; shops: number; onlyMembers?: boolean; compact?: boolean }) {
  const { registrationOpen } = useAuth();
  const loc = useLocation();
  const from = { from: loc.pathname + loc.search };
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Link to="/prijava" state={from} className={buttonClasses('primary', 'md')}>
        {t('members.login')}
      </Link>
      {registrationOpen && (
        <Link to="/registracija" state={from} className={buttonClasses('outline', 'md')}>
          {t('members.register')}
        </Link>
      )}
    </div>
  );
  const text = (
    <>
      <div className="font-extrabold">
        {tn('members.teaser.offers', n)} {tn('members.teaser.shops', shops)}
      </div>
      <p className="mt-0.5 text-sm text-ink-2">{onlyMembers ? t('members.teaser.onlyMembers') : t('members.teaser.text')}</p>
    </>
  );
  if (compact) {
    return (
      <div>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
            <LockIcon size={20} />
          </span>
          <div className="min-w-0">{text}</div>
        </div>
        <div className="mt-4">{actions}</div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-dashed border-ink-3/40 bg-surface-2 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
        <LockIcon size={22} />
      </span>
      <div className="min-w-0 flex-1">{text}</div>
      {actions}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3 sm:px-4">
      <dt className="text-[11px] font-semibold leading-tight text-ink-3 sm:text-xs">{label}</dt>
      <dd className="tabular mt-1 whitespace-nowrap text-[15px] font-extrabold sm:text-lg">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-ink-3">{hint}</dd>}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2">
      <Skeleton className="aspect-square rounded-3xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-48 w-full rounded-3xl" />
      </div>
    </div>
  );
}
