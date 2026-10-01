import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { LogoMark } from '../components/Logo';
import { Button, Spinner, buttonClasses } from '../components/ui';
import { t } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field } from './Login';

interface LinkInfo {
  email: string;
  name: string;
  kind: 'invite' | 'reset';
}

/** /poziv/:token: set a password from an invitation or a new-password link, then sign in. */
export default function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const info = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<LinkInfo>(`/api/auth/invite/${encodeURIComponent(token)}`),
    retry: false,
    staleTime: Infinity,
  });
  const [name, setName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError(t('invite.short'));
    if (password !== repeat) return setError(t('invite.mismatch'));
    setBusy(true);
    setError('');
    try {
      await api(`/api/auth/invite/${encodeURIComponent(token)}`, {
        method: 'POST',
        json: { password, name: name ?? info.data?.name ?? '' },
      });
      qc.removeQueries({ queryKey: ['invite', token] });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const invite = info.data?.kind !== 'reset';
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-12">
      <div className="studs absolute inset-0 bg-brand opacity-100" aria-hidden />
      <div className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-7 shadow-lift sm:p-9">
        <div className="flex items-center gap-3">
          <LogoMark className="h-11 w-11" />
          <span className="text-2xl font-extrabold tracking-tight">Kockolov</span>
        </div>

        {info.isLoading && (
          <div className="grid place-items-center py-16">
            <Spinner className="h-8 w-8" />
          </div>
        )}

        {info.isError && (
          <>
            <h1 className="mt-6 text-2xl font-extrabold">{t('invite.goneTitle')}</h1>
            <p className="mt-2 text-ink-2">{(info.error as Error).message}</p>
            {/* already signed in (e.g. the link was just used): go on to the site instead */}
            <Link to={user ? '/' : '/prijava'} className={buttonClasses('dark', 'lg', 'mt-6 w-full')}>
              {user ? t('invite.toHome') : t('invite.toLogin')}
            </Link>
          </>
        )}

        {info.data && (
          <>
            <h1 className="mt-6 text-2xl font-extrabold">{invite ? t('invite.title') : t('invite.resetTitle')}</h1>
            <p className="mt-1 text-ink-2">
              {invite ? t('invite.subtitle', { email: info.data.email }) : t('invite.resetSubtitle', { email: info.data.email })}
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              {/* lets password managers save the login under the right address */}
              <input type="email" name="username" autoComplete="username" value={info.data.email} readOnly hidden />
              {invite && (
                <Field
                  label={t('register.name')}
                  value={name ?? info.data.name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={80}
                />
              )}
              <Field
                label={t('invite.password')}
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
              <Field
                label={t('invite.repeat')}
                type="password"
                required
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                autoComplete="new-password"
              />
              {error && (
                <p role="alert" className="rounded-xl bg-deal-soft px-3 py-2 text-sm font-semibold text-deal">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {t('invite.submit')}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
