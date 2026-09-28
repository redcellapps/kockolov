import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api, type MeResponse } from './api';

interface AuthState extends MeResponse {
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/api/auth/me'), staleTime: 60_000 });
  const value: AuthState = {
    user: q.data?.user ?? null,
    publicMode: q.data?.publicMode ?? false,
    registrationOpen: q.data?.registrationOpen ?? false,
    loading: q.isLoading,
    refresh: async () => {
      await qc.invalidateQueries();
    },
    logout: async () => {
      await api('/api/auth/logout', { method: 'POST' });
      // full reload: nothing from the previous session stays in memory
      window.location.assign('/prijava');
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
