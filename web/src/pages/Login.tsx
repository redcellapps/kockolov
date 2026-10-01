import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LogoMark } from '../components/Logo';
import { Button } from '../components/ui';
import { t } from '../i18n';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePageTitle } from '../lib/title';

export function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ink-2">{label}</span>
      <input
        {...rest}
        className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] outline-none transition focus:border-ink focus:shadow-card"
      />
    </label>
  );
}

/** Yellow studded page with a centered card: login, sign-up, invite and unsubscribe pages. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-12">
      <div className="studs absolute inset-0 bg-brand opacity-100" aria-hidden />
      <div className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-7 shadow-lift sm:p-9">
        <div className="flex items-center gap-3">
          <LogoMark className="h-11 w-11" />
          <span className="text-2xl font-extrabold tracking-tight">Kockolov</span>
        </div>
        {children}
      </div>
    </div>
  );
}

type Mode = 'login' | 'register' | 'forgot';
const PATHS: Record<Mode, string> = { login: '/prijava', register: '/registracija', forgot: '/zaboravljena-lozinka' };

function modeFor(pathname: string): Mode {
  if (pathname === PATHS.register) return 'register';
  if (pathname === PATHS.forgot) return 'forgot';
  return 'login';
}

/** "Check your inbox" after signing up or asking for a new password, with a resend button. */
function CheckInbox({ kind, email, onBack }: { kind: 'signup' | 'forgot'; email: string; onBack: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | string>('idle');
  async function resend() {
    setState('busy');
    try {
      await api(kind === 'signup' ? '/api/auth/resend' : '/api/auth/forgot', { method: 'POST', json: { email } });
      setState('sent');
    } catch (err) {
      setState((err as Error).message);
    }
  }
  return (
    <>
      <h1 className="mt-6 text-2xl font-extrabold">{t('check.title')}</h1>
      <p className="mt-2 text-ink-2">{kind === 'signup' ? t('check.signup', { email }) : t('check.forgot', { email })}</p>
      <p className="mt-3 text-sm text-ink-3">{t('check.spam')}</p>
      {state === 'sent' && <p className="mt-4 rounded-xl bg-save-soft px-3 py-2 text-sm font-semibold text-save">{t('check.resent')}</p>}
      {state !== 'idle' && state !== 'busy' && state !== 'sent' && (
        <p role="alert" className="mt-4 rounded-xl bg-deal-soft px-3 py-2 text-sm font-semibold text-deal">
          {state}
        </p>
      )}
      <div className="mt-6 grid gap-2">
        <Button variant="outline" size="lg" onClick={resend} disabled={state === 'busy' || state === 'sent'}>
          {t('check.resend')}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {t('check.back')}
        </Button>
      </div>
    </>
  );
}

export default function LoginPage() {
  const { refresh, registrationOpen } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const mode = modeFor(loc.pathname);
  usePageTitle(mode === 'login' ? t('title.login') : mode === 'register' ? t('title.register') : t('title.forgot'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ kind: 'signup' | 'forgot'; email: string } | null>(null);

  function go(next: Mode) {
    setError(null);
    setSent(null);
    // keep where the user was heading, so login still returns there
    navigate(PATHS[next], { replace: true, state: loc.state });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await api('/api/auth/login', { method: 'POST', json: { email, password } });
        await refresh(); // LoginRoute then redirects to where the user was going
      } else if (mode === 'register') {
        await api('/api/auth/register', { method: 'POST', json: { email, password, name } });
        setSent({ kind: 'signup', email: email.trim() });
      } else {
        await api('/api/auth/forgot', { method: 'POST', json: { email } });
        setSent({ kind: 'forgot', email: email.trim() });
      }
    } catch (err) {
      setError({ message: (err as Error).message, code: err instanceof ApiError ? err.code : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    setBusy(true);
    try {
      await api('/api/auth/resend', { method: 'POST', json: { email } });
      setSent({ kind: 'signup', email: email.trim() });
    } catch (err) {
      setError({ message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthCard>
        <CheckInbox kind={sent.kind} email={sent.email} onBack={() => go('login')} />
      </AuthCard>
    );
  }

  const title = mode === 'login' ? t('login.title') : mode === 'register' ? t('register.title') : t('forgot.title');
  const subtitle =
    mode === 'register'
      ? t('register.subtitle')
      : mode === 'forgot'
        ? t('forgot.subtitle')
        : !registrationOpen
          ? t('login.subtitle')
          : null;

  return (
    <AuthCard>
      <h1 className="mt-6 text-2xl font-extrabold">{title}</h1>
      {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'register' && (
          <Field label={t('register.name')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
        )}
        <Field
          label={t('login.email')}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
        />
        {mode !== 'forgot' && (
          <div>
            <Field
              label={mode === 'register' ? t('register.password') : t('login.password')}
              type="password"
              required
              minLength={mode === 'register' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'login' && (
              <button type="button" onClick={() => go('forgot')} className="mt-2 cursor-pointer text-sm font-semibold text-accent hover:underline">
                {t('login.forgot')}
              </button>
            )}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl bg-deal-soft px-3 py-2 text-sm font-semibold text-deal">
            {error.message}
            {error.code === 'unconfirmed' && (
              <button type="button" onClick={resendConfirmation} disabled={busy} className="mt-1 block cursor-pointer underline">
                {t('login.resend')}
              </button>
            )}
            {error.code === 'exists' && (
              <button type="button" onClick={() => go('forgot')} className="mt-1 block cursor-pointer underline">
                {t('login.forgot')}
              </button>
            )}
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {mode === 'login' ? t('login.submit') : mode === 'register' ? t('register.submit') : t('forgot.submit')}
        </Button>
        {mode === 'register' && (
          <p className="text-center text-xs text-ink-3">
            {t('register.privacy')}{' '}
            <Link to="/privatnost" className="font-semibold text-ink-2 underline">
              {t('register.privacyLink')}
            </Link>
            .
          </p>
        )}
      </form>
      {mode === 'forgot' ? (
        <button onClick={() => go('login')} className="mt-5 w-full cursor-pointer text-center text-sm font-bold text-accent hover:underline">
          {t('check.back')}
        </button>
      ) : (
        registrationOpen && (
          <button
            onClick={() => go(mode === 'login' ? 'register' : 'login')}
            className="mt-5 w-full cursor-pointer text-center text-sm font-bold text-accent hover:underline"
          >
            {mode === 'login' ? t('login.register') : t('login.haveAccount')}
          </button>
        )
      )}
    </AuthCard>
  );
}
