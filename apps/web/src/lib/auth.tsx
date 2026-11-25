import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Me } from './api';

interface AuthCtx {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    retry: false,
    queryFn: async () => {
      try { return await api<Me>('/auth/me'); }
      catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
    },
  });

  const value: AuthCtx = {
    user: me.data ?? null,
    loading: me.isLoading,
    login: async (email, password) => {
      const u = await api<Me>('/auth/login', { method: 'POST', body: { email, password } });
      qc.setQueryData(['me'], u);
    },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' });
      // Se vacía la caché de datos (otro usuario no debe ver la del anterior) conservando la consulta de sesión que el contexto observa.
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
    refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
