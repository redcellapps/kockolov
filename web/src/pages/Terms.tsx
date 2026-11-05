import { t, type TKey } from '../i18n';
import { CONTACT_EMAIL } from '../lib/site';
import { usePageTitle } from '../lib/title';
import { linkify } from './Privacy';

const SECTIONS: { h: TKey; p: TKey[] }[] = [
  { h: 'terms.what.h', p: ['terms.what.1', 'terms.what.2', 'terms.what.3'] },
  { h: 'terms.account.h', p: ['terms.account.1', 'terms.account.2', 'terms.account.3'] },
  { h: 'terms.who.h', p: ['terms.who.1', 'terms.who.2', 'terms.who.3'] },
  { h: 'terms.rules.h', p: ['terms.rules.1', 'terms.rules.2', 'terms.rules.3', 'terms.rules.4'] },
  { h: 'terms.life.h', p: ['terms.life.1', 'terms.life.2', 'terms.life.3'] },
  { h: 'terms.content.h', p: ['terms.content.1', 'terms.content.2'] },
  { h: 'terms.deal.h', p: ['terms.deal.1', 'terms.deal.2'] },
  { h: 'terms.messages.h', p: ['terms.messages.1'] },
  { h: 'terms.report.h', p: ['terms.report.1', 'terms.report.2'] },
  { h: 'terms.liab.h', p: ['terms.liab.1'] },
  { h: 'terms.changes.h', p: ['terms.changes.1', 'terms.changes.2'] },
];

export default function TermsPage() {
  usePageTitle(t('title.terms'));
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('terms.title')}</h1>
      <p className="mt-2 text-sm text-ink-3">{t('terms.updated')}</p>
      <p className="mt-6 text-[17px] leading-relaxed text-ink-2">{linkify(t('terms.intro'))}</p>
      {SECTIONS.map((s) => (
        <section key={s.h} className="mt-9">
          <h2 className="text-xl font-extrabold">{t(s.h)}</h2>
          {s.p.length > 2 ? (
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-2 marker:text-ink-3">
              {s.p.map((k) => (
                <li key={k}>{linkify(t(k, { email: CONTACT_EMAIL }))}</li>
              ))}
            </ul>
          ) : (
            s.p.map((k) => (
              <p key={k} className="mt-3 leading-relaxed text-ink-2">
                {linkify(t(k, { email: CONTACT_EMAIL }))}
              </p>
            ))
          )}
        </section>
      ))}
    </article>
  );
}
