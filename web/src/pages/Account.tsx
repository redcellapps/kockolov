import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Toggle } from '../components/ui';
import { t } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePageTitle } from '../lib/title';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
      <h2 className="mb-4 text-lg font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

const input = 'h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none focus:border-ink';

export default function AccountPage() {
  const { user, refresh } = useAuth();
  usePageTitle(t('title.account'));
  const [name, setName] = useState(user?.name ?? '');
  const [digest, setDigest] = useState(user?.digest_enabled ?? true);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [delPw, setDelPw] = useState('');
  useEffect(() => {
    setName(user?.name ?? '');
    setDigest(user?.digest_enabled ?? true);
  }, [user]);

  const save = useMutation({
    mutationFn: (body: { name?: string; digestEnabled?: boolean }) => api('/api/me', { method: 'PATCH', json: body }),
    onSuccess: () => refresh(),
  });
  const pw = useMutation({
    mutationFn: () => api('/api/me/password', { method: 'POST', json: { current: cur, next } }),
    onSuccess: () => {
      setCur('');
      setNext('');
    },
  });

  const remove = useMutation({
    mutationFn: () => api('/api/me', { method: 'DELETE', json: { password: delPw } }),
    // full reload: nothing from the deleted account stays in memory
    onSuccess: () => window.location.assign('/'),
  });

  if (!user) return null;
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('account.title')}</h1>

      <Card title={t('account.profile')}>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate({ name });
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('account.email')}</span>
            <input className={`${input} bg-surface-2 text-ink-2`} value={user.email} disabled />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('account.name')}</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              {t('account.save')}
            </Button>
            {save.isSuccess && <span className="text-sm font-semibold text-save">{t('account.saved')}</span>}
          </div>
        </form>
      </Card>

      <Card title={t('account.digest')}>
        <Toggle
          checked={digest}
          onChange={(v) => {
            setDigest(v);
            save.mutate({ digestEnabled: v });
          }}
          label={t('account.digest')}
        />
        <p className="mt-2 text-sm text-ink-3">{t('account.digest.hint')}</p>
      </Card>

      <Card title={t('account.password')}>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            pw.mutate();
          }}
        >
          <input
            className={input}
            type="password"
            placeholder={t('account.password.current')}
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            autoComplete="current-password"
            required
          />
          <input
            className={input}
            type="password"
            placeholder={t('account.password.new')}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
          {pw.isError && <p className="text-sm font-semibold text-deal">{(pw.error as Error).message}</p>}
          {pw.isSuccess && <p className="text-sm font-semibold text-save">{t('account.password.done')}</p>}
          <Button type="submit" variant="dark" disabled={pw.isPending}>
            {t('account.password.submit')}
          </Button>
        </form>
      </Card>

      <Card title={t('account.delete')}>
        <p className="text-sm text-ink-2">{t('account.delete.text')}</p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            remove.mutate();
          }}
        >
          <input
            className={input}
            type="password"
            placeholder={t('account.delete.password')}
            aria-label={t('account.delete.password')}
            value={delPw}
            onChange={(e) => setDelPw(e.target.value)}
            autoComplete="current-password"
            required
          />
          {remove.isError && <p className="text-sm font-semibold text-deal">{(remove.error as Error).message}</p>}
          <Button type="submit" variant="danger" disabled={remove.isPending || !delPw}>
            {t('account.delete.submit')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
