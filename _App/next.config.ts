import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? '/GrokShareBoard' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/GrokShareBoard/' : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

