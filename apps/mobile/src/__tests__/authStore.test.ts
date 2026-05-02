import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock expo-secure-store before importing authStore.
const { mockSetItem, mockDeleteItem, mockGetItem } = vi.hoisted(() => ({
  mockSetItem:    vi.fn().mockResolvedValue(undefined),
  mockDeleteItem: vi.fn().mockResolvedValue(undefined),
  mockGetItem:    vi.fn().mockResolvedValue(null as string | null),
}));

vi.mock('expo-secure-store', () => ({
  setItemAsync:    mockSetItem,
  deleteItemAsync: mockDeleteItem,
  getItemAsync:    mockGetItem,
}));

import { useAuthStore } from '../lib/authStore';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the Zustand store state between tests
  useAuthStore.setState({ accessToken: null });
});

describe('useAuthStore.setTokens', () => {
  it('stores the access token in the Zustand in-memory state', async () => {
    await useAuthStore.getState().setTokens('acc-token', 'ref-token');
    expect(useAuthStore.getState().accessToken).toBe('acc-token');
  });

  it('persists the refresh token to SecureStore', async () => {
    await useAuthStore.getState().setTokens('acc', 'ref-secret');
    expect(mockSetItem).toHaveBeenCalledWith('gfp:refreshToken', 'ref-secret');
  });

  it('does NOT write the access token to SecureStore', async () => {
    await useAuthStore.getState().setTokens('acc', 'ref');
    // setItemAsync should only be called once (for the refresh token)
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const [key] = mockSetItem.mock.calls[0] as [string, string];
    expect(key).toBe('gfp:refreshToken');
    expect(key).not.toBe('acc');
  });
});

describe('useAuthStore.clearTokens', () => {
  it('sets accessToken to null', async () => {
    useAuthStore.setState({ accessToken: 'existing' });
    await useAuthStore.getState().clearTokens();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('deletes the refresh token from SecureStore', async () => {
    await useAuthStore.getState().clearTokens();
    expect(mockDeleteItem).toHaveBeenCalledWith('gfp:refreshToken');
  });

  it('is safe to call when tokens are already null', async () => {
    await expect(useAuthStore.getState().clearTokens()).resolves.not.toThrow();
  });
});

describe('useAuthStore.loadRefreshToken', () => {
  it('returns null when SecureStore has no token', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    const result = await useAuthStore.getState().loadRefreshToken();
    expect(result).toBeNull();
  });

  it('returns the stored refresh token', async () => {
    mockGetItem.mockResolvedValueOnce('stored-refresh');
    const result = await useAuthStore.getState().loadRefreshToken();
    expect(result).toBe('stored-refresh');
  });

  it('reads from the correct SecureStore key', async () => {
    await useAuthStore.getState().loadRefreshToken();
    expect(mockGetItem).toHaveBeenCalledWith('gfp:refreshToken');
  });
});
