import { Link } from 'react-router';
import { buttonClasses } from '../components/ui';
import { t, type TKey } from '../i18n';
import { CONTACT_EMAIL } from '../lib/site';
import { usePageTitle } from '../lib/title';
import { linkify } from './Privacy';

const STEPS: TKey[] = ['deleteInfo.self.1', 'deleteInfo.self.2', 'deleteInfo.self.3'];
const WHAT: TKey[] = ['deleteInfo.what.1', 'deleteInfo.what.2', 'deleteInfo.what.3', 'deleteInfo.what.4'];

/**
 * /brisanje-naloga: how to delete an account, for anyone (no sign-in needed). Google Play and the
 * App Store ask for such a page; the deletion itself is in the account settings (pages/Account.tsx).
 */
export default function DeleteAccountPage() {
  usePageTitle(t('title.deleteAccount'));
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('deleteInfo.title')}</h1>
      <p className="mt-6 text-[17px] leading-relaxed text-ink-2">{t('deleteInfo.intro')}</p>

      <section className="mt-9">
        <h2 className="text-xl font-extrabold">{t('deleteInfo.self.h')}</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed text-ink-2 marker:font-bold marker:text-ink-3">
          {STEPS.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
        <Link to="/nalog" className={buttonClasses('dark', 'md', 'mt-5')}>
          {t('deleteInfo.self.go')}
        </Link>
      </section>

      <section className="mt-9">
        <h2 className="text-xl font-extrabold">{t('deleteInfo.help.h')}</h2>
        <p className="mt-3 leading-relaxed text-ink-2">{t('deleteInfo.help.1')}</p>
        <p className="mt-3 leading-relaxed text-ink-2">{linkify(t('deleteInfo.help.2', { email: CONTACT_EMAIL }))}</p>
      </section>

      <section className="mt-9">
        <h2 className="text-xl font-extrabold">{t('deleteInfo.what.h')}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-2 marker:text-ink-3">
          {WHAT.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-ink-3">
          <Link to="/privatnost" className="font-semibold text-accent underline">
            {t('deleteInfo.privacy')}
          </Link>
        </p>
      </section>
    </article>
  );
}
