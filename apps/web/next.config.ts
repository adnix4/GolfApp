import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@gfp/theme', '@gfp/shared-types'],
  // Type-check the app, not its vitest suites (they import `vitest`, which the
  // Vercel build cannot resolve). tsconfig.json, used by `npm run type-check`
  // in CI, still covers the tests.
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
