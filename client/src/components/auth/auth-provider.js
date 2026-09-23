'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, AUTH_EVENT, getCachedUser, getToken, setCachedUser, setToken } from '@/lib/api';
import { useLiveUpdates } from '@/lib/live';

const AuthContext = createContext({ user: null, status: 'loading', login: async () => {}, logout: () => {}, refresh: async () => {}, setUser: () => {}, isAdmin: false });

const subscribe = (cb) => {
  window.addEventListener(AUTH_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(AUTH_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};

const meKey = (token) => ['auth', 'me', token];

// false on the server and during hydration, true once the browser's snapshot (localStorage) has been read.
const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Who is signed in. `status`: 'loading' (checking the stored token) | 'anonymous' | 'authenticated' | 'error' (API unreachable).
 * The token lives in localStorage; api.js sends it with every request and drops it on a 401, which flips the status back.
 */
export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const token = useSyncExternalStore(subscribe, getToken, () => '');
  const hydrated = useHydrated();
  // Seed from the remembered user so a reload renders at once and re-checks the session behind it.
  const cached = useMemo(() => (hydrated ? getCachedUser(token) : null), [hydrated, token]);
  const me = useQuery({
    queryKey: meKey(token),
    queryFn: api.auth.me,
    enabled: Boolean(token),
    retry: false,
    staleTime: 5 * 60_000,
    initialData: cached ? { user: cached.user } : undefined,
    initialDataUpdatedAt: cached?.at,
  });

  // Live updates from the API (lib/live.js) while signed in.
  useLiveUpdates(me.data?.user ? token : '');

  // Keep the remembered user in step with what the API last said.
  useEffect(() => {
    if (me.data?.user) setCachedUser(token, me.data.user);
  }, [token, me.data]);

  const login = useCallback(
    async (username, password) => {
      const { token: t, user } = await api.auth.login({ username, password });
      qc.clear(); // no data from a previous user
      qc.setQueryData(meKey(t), { user });
      setCachedUser(t, user);
      setToken(t);
      return user;
    },
    [qc],
  );

  const logout = useCallback(() => {
    api.auth.logout().catch(() => {});
    setToken('');
    qc.clear();
  }, [qc]);

  const setUser = useCallback((user) => qc.setQueryData(meKey(getToken()), { user }), [qc]);

  const value = useMemo(() => {
    // The server (and the first client render) cannot see localStorage, so the token reads as empty there.
    // Stay 'loading' until hydration so a refresh never flashes the sign-in screen before the stored session is checked.
    let status = 'loading';
    if (!hydrated) status = 'loading';
    else if (!token) status = 'anonymous';
    else if (me.data?.user) status = 'authenticated';
    else if (me.isError) status = me.error?.status === 401 ? 'anonymous' : 'error';
    const user = status === 'authenticated' ? me.data.user : null;
    return { user, status, error: me.error?.message, login, logout, refresh: me.refetch, setUser, isAdmin: user?.role === 'admin' };
  }, [hydrated, token, me.data, me.isError, me.error, me.refetch, login, logout, setUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
