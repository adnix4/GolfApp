import React, {
  createContext, useCallback, useContext,
  useEffect, useState, type ReactNode,
} from 'react';
import { authApi } from './api';
import { storage } from './storage';

interface AuthUser {
  email:  string;
  orgId:  string;
  token:  string;
}

interface AuthContextValue {
  user:    AuthUser | null;
  loading: boolean;
  login:   (email: string, password: string) => Promise<void>;
  logout:  () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = storage.getAccessToken();
    if (token) {
      // Decode the JWT payload to extract email + orgId without a library
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ email: payload.email ?? '', orgId: payload.orgId ?? '', token });
      } catch {
        storage.clearTokens();
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    storage.setAccessToken(data.accessToken);
    storage.setRefreshToken(data.refreshToken);
    setUser({ email, orgId: data.orgId, token: data.accessToken });
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = storage.getRefreshToken();
    if (refreshToken) {
      try { await authApi.logout(refreshToken); } catch { /* best effort */ }
    }
    storage.clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
