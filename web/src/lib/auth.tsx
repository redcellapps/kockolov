import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, Fragment, useContext, type ReactNode } from 'react';
import { api, type MeResponse } from './api';
import { setDisplayCurrency } from './format';

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
      await api('/api/auth/logout', { method: 'POST' });
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
