import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@gfp/theme', '@gfp/shared-types'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
