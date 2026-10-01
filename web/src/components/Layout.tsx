import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { t } from '../i18n';
import { api, type Stats } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { ClockIcon, HeartIcon } from './icons';
import { ErrorBoundary } from './ErrorBoundary';
import { Logo } from './Logo';
import { SearchBox } from './SearchBox';
import { cx } from './ui';

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!user) {
    return (
      <Link to="/prijava" className="rounded-xl px-3 py-2 text-sm font-bold hover:bg-surface-2">
        {t('nav.login')}
      </Link>
    );
  }
  const initial = (user.name || user.email).trim()[0]?.toUpperCase() ?? '?';
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-10 w-10 place-items-center rounded-full bg-ink text-sm font-extrabold text-bg cursor-pointer"
        aria-label={t('nav.account')}
        aria-expanded={open}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-bold">{user.name || user.email}</div>
            {user.name && <div className="truncate text-xs text-ink-3">{user.email}</div>}
          </div>
          <div className="my-1 h-px bg-line" />
          {[
            ['/pracenje', t('nav.watchlist')],
            ['/nalog', t('nav.account')],
            ...(user.role === 'admin' ? [['/admin', t('nav.admin')]] : []),
          ].map(([to, label]) => (
            <Link key={to} to={to} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-sm font-semibold hover:bg-surface-2">
              {label}
            </Link>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-deal hover:bg-surface-2 cursor-pointer"
          >
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isHome = pathname === '/';
  const link = ({ isActive }: { isActive: boolean }) =>
    cx('rounded-xl px-3 py-2 text-sm font-bold transition', isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink');
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-line/80 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link to="/" className="shrink-0" aria-label="Kockolov">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/ponude" className={link}>
            {t('nav.deals')}
          </NavLink>
          <NavLink to="/pretraga" className={link}>
            {t('nav.search')}
          </NavLink>
          <NavLink to="/teme" className={link}>
            {t('nav.themes')}
          </NavLink>
        </nav>
        <div className="flex-1">{!isHome && <SearchBox className="mx-auto hidden max-w-xl sm:block" />}</div>
        {user && (
          <NavLink to="/pracenje" className={({ isActive }) => cx(link({ isActive }), 'hidden items-center gap-1.5 sm:flex')}>
            <HeartIcon size={18} /> {t('nav.watchlist')}
          </NavLink>
        )}
        <UserMenu />
      </div>
      {/* mobile: nav + search */}
      <div className="border-t border-line/60 md:hidden">
        <nav className="scrollbar-none mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 py-1.5">
          <NavLink to="/ponude" className={link}>
            {t('nav.deals')}
          </NavLink>
          <NavLink to="/pretraga" className={link}>
            {t('nav.search')}
          </NavLink>
          <NavLink to="/teme" className={link}>
            {t('nav.themes')}
          </NavLink>
          {user && (
            <NavLink to="/pracenje" className={link}>
              {t('nav.watchlist')}
            </NavLink>
          )}
        </nav>
        {!isHome && (
          <div className="px-4 pb-3 sm:hidden">
            <SearchBox />
          </div>
        )}
      </div>
    </header>
  );
}

function Footer() {
  const { user, publicMode } = useAuth();
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<Stats>('/api/stats'),
    enabled: !!user || publicMode,
    staleTime: 300_000,
  });
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <Logo />
          <p className="mt-3 text-sm text-ink-2">{t('app.tagline')}</p>
          {stats.data?.last_update && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-3">
              <ClockIcon size={14} />
              {t('footer.updated', { when: ago(stats.data.last_update) })}
            </p>
          )}
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-ink-3">{t('footer.disclaimer')}</p>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // Braces matter: newer Chrome returns a Promise from scrollTo, and an effect may only return a cleanup function
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
