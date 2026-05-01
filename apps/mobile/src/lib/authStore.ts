import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// Spec Foundation §5.2:
//   Access token  → in-memory Zustand store. Never written to disk.
//   Refresh token → expo-secure-store. Encrypted, hardware-backed on iOS.
//
// Note: the Phase 2 golfer join flow (event code + email) does not issue JWT
// tokens, so this store starts empty. It is used by EventStaff/OrgAdmin
// flows that authenticate via POST /auth/login and receive token pairs.

const REFRESH_KEY = 'gfp:refreshToken';

interface AuthStore {
  accessToken: string | null;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  clearTokens: () => Promise<void>;
  loadRefreshToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  accessToken: null,

  setTokens: async (accessToken, refreshToken) => {
    // Access token lives only in the Zustand store — never touches disk.
    set({ accessToken });
    // Refresh token is AES-256 encrypted by the OS keychain / Keystore.
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  },

  clearTokens: async () => {
    set({ accessToken: null });
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },

  // Called at app boot to attempt a silent token refresh.
  loadRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
}));
