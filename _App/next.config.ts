import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['127.0.0.1'],
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? '/GrokShareBoard' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/GrokShareBoard/' : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
