import React, {
  createContext, useCallback, useContext,
  useEffect, useState, type ReactNode,
} from 'react';
import { authApi } from './api';
import { storage } from './storage';

export interface AuthUser {
  email:       string;
  orgId:       string;
  role:        string;       // "OrgAdmin" | "SuperAdmin" | ...
  displayName: string;
  token:       string;
}

export interface RegisterPayload {
  email:       string;
  password:    string;
  displayName: string;
  orgName:     string;
  orgSlug:     string;
  is501c3?:    boolean;
}

interface AuthContextValue {
  user:     AuthUser | null;
  loading:  boolean;
  login:    (email: string, password: string) => Promise<void>;
  logout:   () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeUser(token: string): AuthUser {
  const payload = JSON.parse(atob(token.split('.')[1]));
  // ClaimTypes.Role maps to short "role" via JwtSecurityTokenHandler.OutboundClaimTypeMap.
  // Fall back to the long .NET claim URI in case the map is disabled.
  const role =
    payload['role'] ??
    payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ??
    'OrgAdmin';
  return {
    email:       payload.email       ?? '',
    orgId:       payload.orgId       ?? '',
    role,
    displayName: payload.displayName ?? '',
    token,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from storage on mount
  useEffect(() => {
    const token = storage.getAccessToken();
    if (token) {
      try {
        setUser(decodeUser(token));
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
    setUser(decodeUser(data.accessToken));
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = storage.getRefreshToken();
    if (refreshToken) {
      try { await authApi.logout(refreshToken); } catch { /* best effort */ }
    }
    storage.clearTokens();
    setUser(null);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const data = await authApi.register(payload);
    storage.setAccessToken(data.accessToken);
    storage.setRefreshToken(data.refreshToken);
    setUser(decodeUser(data.accessToken));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
