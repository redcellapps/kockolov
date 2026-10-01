import { Fragment, type ReactNode } from 'react';
import { t, type TKey } from '../i18n';
import { CONTACT_EMAIL } from '../lib/site';
import { usePageTitle } from '../lib/title';

const SECTIONS: { h: TKey; p: TKey[] }[] = [
  { h: 'privacy.who.h', p: ['privacy.who.1', 'privacy.who.2'] },
  { h: 'privacy.what.h', p: ['privacy.what.1', 'privacy.what.2', 'privacy.what.3', 'privacy.what.4', 'privacy.what.5', 'privacy.what.6'] },
  { h: 'privacy.why.h', p: ['privacy.why.1', 'privacy.why.2', 'privacy.why.3', 'privacy.why.4'] },
  { h: 'privacy.cookies.h', p: ['privacy.cookies.1'] },
  { h: 'privacy.where.h', p: ['privacy.where.1', 'privacy.where.2', 'privacy.where.3'] },
  { h: 'privacy.keep.h', p: ['privacy.keep.1', 'privacy.keep.2', 'privacy.keep.3'] },
  { h: 'privacy.rights.h', p: ['privacy.rights.1', 'privacy.rights.2', 'privacy.rights.3'] },
  { h: 'privacy.kids.h', p: ['privacy.kids.1'] },
  { h: 'privacy.changes.h', p: ['privacy.changes.1'] },
];

const LINKS: Record<string, string> = {
  [CONTACT_EMAIL]: `mailto:${CONTACT_EMAIL}`,
  'poverenik.rs': 'https://www.poverenik.rs',
};

/** Turns the contact address and the Commissioner's site into links. */
function linkify(text: string): ReactNode {
  const parts = text.split(new RegExp(`(${Object.keys(LINKS).map((k) => k.replace(/\./g, '\\.')).join('|')})`));
  return parts.map((part, i) =>
    LINKS[part] ? (
      <a key={i} href={LINKS[part]} className="font-semibold text-accent underline" {...(part.includes('@') ? {} : { target: '_blank', rel: 'noreferrer' })}>
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export default function PrivacyPage() {
  usePageTitle(t('title.privacy'));
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('privacy.title')}</h1>
      <p className="mt-2 text-sm text-ink-3">{t('privacy.updated')}</p>
      <p className="mt-6 text-[17px] leading-relaxed text-ink-2">{t('privacy.intro')}</p>
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
