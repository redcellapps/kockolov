import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, Fragment, useContext, useEffect, type ReactNode } from 'react';
import { api, type MeResponse } from './api';
import { setDisplayCurrency } from './format';
import { setAppToken } from './platform';
import { forgetPushOnSignOut, syncPush } from './pwa';

interface AuthState extends MeResponse {
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/api/auth/me'), staleTime: 60_000 });
  // prices render in the user's currency; set before the children render, and remount them on a change
  const currency = q.data?.user?.currency === 'EUR' ? 'EUR' : 'RSD';
  setDisplayCurrency(currency, q.data?.fx?.eur.rate ?? 0);
  const userId = q.data?.user?.id;
  // a phone with notifications on gets the alerts of whoever is signed in on it now
  useEffect(() => {
    if (userId) void syncPush();
  }, [userId]);
  const value: AuthState = {
    user: q.data?.user ?? null,
    publicMode: q.data?.publicMode ?? false,
    registrationOpen: q.data?.registrationOpen ?? false,
    fx: q.data?.fx,
    loading: q.isLoading,
    refresh: async () => {
      await qc.invalidateQueries();
    },
    logout: async () => {
      // this device stops getting the account's notifications
      await forgetPushOnSignOut();
      await api('/api/auth/logout', { method: 'POST' });
      await setAppToken(null);
      if (import.meta.env.VITE_DEMO) {
        // in-browser preview: no server behind it, so drop cached data and re-read the session
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        await qc.refetchQueries({ queryKey: ['me'] });
        window.location.hash = '#/prijava';
        return;
      }
      // full reload: nothing from the previous session stays in memory
      window.location.assign('/prijava');
    },
  };
  return (
    <Ctx.Provider value={value}>
      <Fragment key={currency}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
