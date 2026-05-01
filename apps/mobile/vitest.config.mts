import { defineConfig } from 'vitest/config';
import path from 'path';

const mocks = path.resolve(__dirname, 'src/__mocks__');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  // Expo and React Native packages that point to TypeScript source (not compiled JS)
  // or reference native-only globals (__DEV__) must be replaced with plain-JS stubs
  // so Vite/Rollup can parse the dependency chain.
  define: {
    __DEV__: 'false',
  },
  resolve: {
    alias: {
      '@/':                  path.resolve(__dirname, './src/'),
      'expo-modules-core':   path.join(mocks, 'expo-modules-core.js'),
      'expo-secure-store':   path.join(mocks, 'expo-secure-store.js'),
      'expo-sqlite':         path.join(mocks, 'expo-sqlite.js'),
      'react-native':        path.join(mocks, 'react-native.js'),
      'expo':                path.join(mocks, 'expo.js'),
    },
  },
});
