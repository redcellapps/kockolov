import { Link } from 'react-router';
import { t } from '../../i18n';
import type { Shop } from '../../lib/api';
import { SHOPS } from '../../lib/format';
import { BellIcon, CheckIcon } from '../icons';
import { buttonClasses } from '../ui';

/**
 * Home page, visitors only: every shop's prices are public, so the account is about what Kockolov
 * does for you afterwards: watching sets, the morning e-mail, the classifieds. The shop row shows
 * how many shops are compared, for everyone, without signing in.
 */
export function AccountCta({ shops, registrationOpen, listings }: { shops: Shop[]; registrationOpen: boolean; listings: boolean }) {
  const visible = shops.filter((s) => s.offers_in_stock > 0);
  const primary = registrationOpen ? '/registracija' : '/prijava';
  const bullets = ['accountCta.b1', 'accountCta.b2', listings ? 'accountCta.b3ads' : 'accountCta.b3eur'] as const;

  return (
    <section id="nalog-cta" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-8 sm:px-6 sm:pt-10" aria-labelledby="account-cta-title">
      <div className="relative isolate overflow-hidden rounded-3xl bg-ink p-6 text-bg sm:p-8 lg:grid lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-12 lg:p-10">
        {/* a faint brick in the corner, like the one behind the hero */}
        <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute -bottom-20 -left-16 -z-10 h-64 w-64 rotate-12 text-bg/[0.05]">
          <rect x="10" y="10" width="180" height="180" rx="18" fill="currentColor" />
          {[60, 140].flatMap((cx) => [60, 140].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="26" fill="currentColor" />))}
        </svg>

        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-ink">
            <BellIcon size={13} /> {t('accountCta.badge')}
          </p>
          <h2 id="account-cta-title" className="mt-4 text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            {t('accountCta.title')}
          </h2>
          <p className="mt-3 max-w-xl text-pretty text-bg/75 sm:text-lg">{t('accountCta.lead', { n: visible.length })}</p>
          <ul className="mt-5 grid gap-2.5 text-[15px] font-semibold">
            {bullets.map((k) => (
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
          <div className="rounded-2xl border border-bg/10 bg-bg/[0.06] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider text-bg/60">
              <span>{t('accountCta.shopsLabel')}</span>
              <span className="tabular">{visible.length}</span>
            </div>
            <ul className="flex flex-wrap gap-2" aria-label={t('accountCta.shopsLabel')}>
              {visible.map((s) => (
                <li key={s.id} className="inline-flex h-8 items-center gap-2 rounded-full bg-bg px-3 text-sm font-bold text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: SHOPS[s.id]?.dot }} />
                  {SHOPS[s.id]?.short ?? s.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to={primary} className={buttonClasses('primary', 'lg', 'w-full sm:w-auto')}>
              {registrationOpen ? t('accountCta.register') : t('accountCta.login')}
            </Link>
            {registrationOpen && (
              <Link to="/prijava" className="text-center text-sm font-bold text-bg/80 underline-offset-4 hover:text-bg hover:underline sm:text-left">
                {t('accountCta.haveAccount')}
              </Link>
            )}
          </div>
          <p className="mt-3 text-center text-xs text-bg/55 sm:text-left">{t('accountCta.note')}</p>
        </div>
      </div>
    </section>
  );
}
