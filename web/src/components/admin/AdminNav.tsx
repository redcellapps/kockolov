import { NavLink } from 'react-router';
import { t } from '../../i18n';
import { cx } from '../ui';

/** Tabs between the admin pages */
export function AdminNav() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    cx(
      'inline-flex h-9 items-center rounded-full px-4 text-sm font-bold transition',
      isActive ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    );
  return (
    <nav aria-label={t('admin.title')} className="flex flex-wrap gap-1">
      <NavLink to="/admin" end className={tab}>
        {t('admin.nav.overview')}
      </NavLink>
      <NavLink to="/admin/ponude" className={tab}>
        {t('admin.nav.offers')}
      </NavLink>
    </nav>
  );
}
