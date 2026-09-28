import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { LogoMark } from '../components/Logo';
import { Button } from '../components/ui';
import { t } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
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

export default function LoginPage() {
  const { refresh, registrationOpen } = useAuth();
  const loc = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>(loc.pathname === '/registracija' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        json: mode === 'login' ? { email, password } : { email, password, name },
      });
      await refresh(); // LoginRoute then redirects to where the user was going
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-12">
      <div className="studs absolute inset-0 bg-brand opacity-100" aria-hidden />
      <div className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-7 shadow-lift sm:p-9">
        <div className="flex items-center gap-3">
          <LogoMark className="h-11 w-11" />
          <span className="text-2xl font-extrabold tracking-tight">Kockolov</span>
        </div>
        <h1 className="mt-6 text-2xl font-extrabold">{mode === 'login' ? t('login.title') : t('register.title')}</h1>
        {mode === 'login' && !registrationOpen && <p className="mt-1 text-ink-2">{t('login.subtitle')}</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' && (
            <Field label={t('register.name')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
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
          <Field
            label={t('login.password')}
            type="password"
            required
            minLength={mode === 'register' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {error && <p className="rounded-xl bg-deal-soft px-3 py-2 text-sm font-semibold text-deal">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {mode === 'login' ? t('login.submit') : t('register.submit')}
          </Button>
        </form>
        {registrationOpen && (
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="mt-5 w-full text-center text-sm font-bold text-accent hover:underline cursor-pointer"
          >
            {mode === 'login' ? t('login.register') : t('login.haveAccount')}
          </button>
        )}
      </div>
    </div>
  );
}
