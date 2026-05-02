// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../lib/storage';

// jsdom (vitest's default environment) provides a real localStorage implementation,
// so we test the wrapper against it without any extra mocking.

beforeEach(() => {
  localStorage.clear();
});

describe('storage.getAccessToken', () => {
  it('returns null when nothing is stored', () => {
    expect(storage.getAccessToken()).toBeNull();
  });

  it('returns the token after setAccessToken', () => {
    storage.setAccessToken('abc123');
    expect(storage.getAccessToken()).toBe('abc123');
  });
});

describe('storage.setAccessToken', () => {
  it('overwrites a previously stored token', () => {
    storage.setAccessToken('first');
    storage.setAccessToken('second');
    expect(storage.getAccessToken()).toBe('second');
  });
});

describe('storage.getRefreshToken', () => {
  it('returns null when nothing is stored', () => {
    expect(storage.getRefreshToken()).toBeNull();
  });

  it('returns the token after setRefreshToken', () => {
    storage.setRefreshToken('ref-xyz');
    expect(storage.getRefreshToken()).toBe('ref-xyz');
  });
});

describe('storage.setRefreshToken', () => {
  it('does not affect the access token', () => {
    storage.setAccessToken('acc');
    storage.setRefreshToken('ref');
    expect(storage.getAccessToken()).toBe('acc');
  });
});

describe('storage.clearTokens', () => {
  it('removes both tokens', () => {
    storage.setAccessToken('acc');
    storage.setRefreshToken('ref');
    storage.clearTokens();
    expect(storage.getAccessToken()).toBeNull();
    expect(storage.getRefreshToken()).toBeNull();
  });

  it('is safe to call when nothing is stored', () => {
    expect(() => storage.clearTokens()).not.toThrow();
  });

  it('does not clear unrelated localStorage keys', () => {
    localStorage.setItem('other-key', 'other-value');
    storage.setAccessToken('acc');
    storage.clearTokens();
    expect(localStorage.getItem('other-key')).toBe('other-value');
  });
});
