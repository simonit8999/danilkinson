import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CONFIG } from '../config';
import { remoteLogin } from '../lib/api';
import {
  clearAdminSession,
  detectAdminFlag,
  grantAdminEntry,
  hasAdminEntry,
  readAdminSession,
  verifyAdmin,
  writeAdminSession,
} from '../lib/auth';
import { sessionRemove, sessionSet } from '../lib/storage';

interface AdminApi {
  entry: boolean;
  authenticated: boolean;
  grantEntry: () => void;
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AdminContext = createContext<AdminApi | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<boolean>(() => {
    const flagged = detectAdminFlag();
    if (flagged) grantAdminEntry();
    return flagged || hasAdminEntry();
  });
  const [authenticated, setAuthenticated] = useState<boolean>(() => readAdminSession());

  const grantEntry = useCallback(() => {
    grantAdminEntry();
    setEntry(true);
  }, []);

  const login = useCallback(async (loginValue: string, password: string) => {
    const ok = await verifyAdmin(loginValue, password);
    if (ok) {
      writeAdminSession();
      grantAdminEntry();
      setAuthenticated(true);
      setEntry(true);

      // Токен нужен серверу, чтобы принимать изменения каталога.
      // Если сервер недоступен, сайт продолжает работать в локальном режиме.
      const token = await remoteLogin(loginValue, password);
      if (token) sessionSet(CONFIG.storage.serverToken, token);
      else sessionRemove(CONFIG.storage.serverToken);
    }
    return ok;
  }, []);

  const logout = useCallback(() => {
    clearAdminSession();
    sessionRemove(CONFIG.storage.adminEntry);
    sessionRemove(CONFIG.storage.serverToken);
    setAuthenticated(false);
    setEntry(false);
  }, []);

  const value = useMemo<AdminApi>(() => ({
    entry,
    authenticated,
    grantEntry,
    login,
    logout,
  }), [entry, authenticated, grantEntry, login, logout]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminApi {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin must be used inside AdminProvider');
  return context;
}
