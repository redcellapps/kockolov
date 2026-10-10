import { t } from '../../i18n';
import { ExternalIcon } from '../icons';
import { cx } from '../ui';

/** "Otvori na kocka.rs ↗": the offer's own page in the shop, to check its price and code there. */
export function ShopPageLink({ url, className }: { url: string; className?: string }) {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={t('admin.offers.open.title')}
      className={cx('inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap text-accent hover:underline', className)}
    >
      {t('admin.offers.open', { host })} <ExternalIcon size={12} />
    </a>
  );
}
