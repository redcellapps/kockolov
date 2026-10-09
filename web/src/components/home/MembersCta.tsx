import { Link } from 'react-router';
import { t, tn } from '../../i18n';
import type { Shop, Stats } from '../../lib/api';
import { SHOPS } from '../../lib/format';
import { CheckIcon, LockIcon } from '../icons';
import { buttonClasses } from '../ui';

// placeholder widths for the shops a visitor can't see yet, so the row looks like real names
const WIDTHS = ['w-14', 'w-10', 'w-16', 'w-12', 'w-9', 'w-14', 'w-11', 'w-16'];
/** locked shops drawn one by one; the rest are summed up as "+N" */
const SHOWN = 6;

/**
 * Home page, visitors only: most shops show their prices to signed-in users, which many visitors
 * didn't realise. Says how much they don't see yet and invites them to make a free account.
 */
export function MembersCta({ stats, shops, registrationOpen }: { stats: Stats; shops: Shop[]; registrationOpen: boolean }) {
  const hidden = stats.members_shops ?? 0;
  const visible = shops.filter((s) => s.offers_in_stock > 0);
  const total = visible.length + hidden;
  const offers = stats.members_offers ?? 0;
  const primary = registrationOpen ? '/registracija' : '/prijava';

  return (
    <section id="members-cta" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-8 sm:px-6 sm:pt-10" aria-labelledby="members-cta-title">
      <div className="relative isolate overflow-hidden rounded-3xl bg-ink p-6 text-bg sm:p-8 lg:grid lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-12 lg:p-10">
        {/* a faint brick in the corner, like the one behind the hero */}
        <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute -bottom-20 -left-16 -z-10 h-64 w-64 rotate-12 text-bg/[0.05]">
          <rect x="10" y="10" width="180" height="180" rx="18" fill="currentColor" />
          {[60, 140].flatMap((cx) => [60, 140].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="26" fill="currentColor" />))}
        </svg>

        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-ink">
            <LockIcon size={13} /> {t('membersCta.badge')}
          </p>
          <h2 id="members-cta-title" className="mt-4 text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            {tn('membersCta.title', total, { pub: visible.length })}
          </h2>
          <p className="mt-3 max-w-xl text-pretty text-bg/75 sm:text-lg">
            {offers > 0 ? tn('membersCta.lead', offers, { shops: tn('members.teaser.shops', hidden) }) : t('membersCta.leadNoCount')}
          </p>
          <ul className="mt-5 grid gap-2.5 text-[15px] font-semibold">
            {(['membersCta.b1', 'membersCta.b2', 'membersCta.b3'] as const).map((k) => (
              <li key={k} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-brand-ink">
                  <CheckIcon size={13} strokeWidth={3} />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-7 lg:mt-0">
          {/* the shops: the ones a visitor sees, then the ones an account unlocks */}
          <div className="rounded-2xl border border-bg/10 bg-bg/[0.06] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider text-bg/60">
              <span>{t('membersCta.shopsLabel')}</span>
              <span className="tabular">
                {visible.length} / {total}
              </span>
            </div>
            <ul className="flex flex-wrap gap-2" aria-label={t('membersCta.shopsLabel')}>
              {visible.map((s) => (
                <li key={s.id} className="inline-flex h-8 items-center gap-2 rounded-full bg-bg px-3 text-sm font-bold text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: SHOPS[s.id]?.dot }} />
                  {SHOPS[s.id]?.short ?? s.name}
                </li>
              ))}
              {Array.from({ length: Math.min(hidden, SHOWN) }).map((_, i) => (
                <li key={i} className="inline-flex h-8 items-center gap-2 rounded-full border border-dashed border-bg/25 px-3 text-bg/50">
                  <LockIcon size={13} />
                  <span className={`h-2 rounded-full bg-bg/20 ${WIDTHS[i % WIDTHS.length]}`} />
                  <span className="sr-only">{t('members.badge')}</span>
                </li>
              ))}
              {hidden > SHOWN && (
                <li className="inline-flex h-8 items-center rounded-full border border-dashed border-bg/25 px-3 text-sm font-bold text-bg/70">
                  {t('membersCta.more', { n: hidden - SHOWN })}
                </li>
              )}
            </ul>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to={primary} className={buttonClasses('primary', 'lg', 'w-full sm:w-auto')}>
              {registrationOpen ? t('membersCta.register') : t('members.login')}
            </Link>
            {registrationOpen && (
              <Link to="/prijava" className="text-center text-sm font-bold text-bg/80 underline-offset-4 hover:text-bg hover:underline sm:text-left">
                {t('membersCta.login')}
              </Link>
            )}
          </div>
          <p className="mt-3 text-center text-xs text-bg/55 sm:text-left">{t('membersCta.note')}</p>
        </div>
      </div>
    </section>
  );
}
