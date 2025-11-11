import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // swcMinify is deprecated in Next.js 16+
  // App Router is stable in Next.js 14+, no need for experimental flag
};

export default nextConfig;
