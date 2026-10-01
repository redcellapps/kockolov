import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Spinner, buttonClasses } from '../components/ui';
import { t } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AuthCard, Field } from './Login';

interface LinkInfo {
  email: string;
  name: string;
  kind: 'invite' | 'reset' | 'verify';
}

/**
 * Links from e-mails. /poziv/:token sets a password (invitation or new password);
 * /potvrda/:token confirms a sign-up. Either way the person ends up signed in.
 */
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

  async function finish(path: string, json?: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST', json: json ?? {} });
      qc.removeQueries({ queryKey: ['invite', token] });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError(t('invite.short'));
    if (password !== repeat) return setError(t('invite.mismatch'));
    void finish(`/api/auth/invite/${encodeURIComponent(token)}`, { password, name: name ?? info.data?.name ?? '' });
  }

  const kind = info.data?.kind;
  const errorBox = error && (
    <p role="alert" className="rounded-xl bg-deal-soft px-3 py-2 text-sm font-semibold text-deal">
      {error}
    </p>
  );

  return (
    <AuthCard>
      {info.isLoading && (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {info.isError && (
        <>
          <h1 className="mt-6 text-2xl font-extrabold">{t('invite.goneTitle')}</h1>
          <p className="mt-2 text-ink-2">{(info.error as Error).message}</p>
          {!user && <p className="mt-1 text-ink-2">{t('invite.goneHint')}</p>}
          {/* already signed in (e.g. the link was just used): go on to the site instead */}
          <Link to={user ? '/' : '/prijava'} className={buttonClasses('dark', 'lg', 'mt-6 w-full')}>
            {user ? t('invite.toHome') : t('invite.toLogin')}
          </Link>
        </>
      )}

      {info.data && kind === 'verify' && (
        <>
          <h1 className="mt-6 text-2xl font-extrabold">{t('invite.verifyTitle')}</h1>
          <p className="mt-1 text-ink-2">{t('invite.verifySubtitle', { email: info.data.email })}</p>
          {/* a button rather than confirming on page load: mail scanners open links too */}
          <div className="mt-6 space-y-4">
            {errorBox}
            <Button size="lg" className="w-full" disabled={busy} onClick={() => finish(`/api/auth/verify/${encodeURIComponent(token)}`)}>
              {t('invite.verifySubmit')}
            </Button>
          </div>
        </>
      )}

      {info.data && kind !== 'verify' && (
        <>
          <h1 className="mt-6 text-2xl font-extrabold">{kind === 'invite' ? t('invite.title') : t('invite.resetTitle')}</h1>
          <p className="mt-1 text-ink-2">
            {kind === 'invite' ? t('invite.subtitle', { email: info.data.email }) : t('invite.resetSubtitle', { email: info.data.email })}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {/* lets password managers save the login under the right address */}
            <input type="email" name="username" autoComplete="username" value={info.data.email} readOnly hidden />
            {kind === 'invite' && (
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
            {errorBox}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {t('invite.submit')}
            </Button>
          </form>
        </>
      )}
    </AuthCard>
  );
}
