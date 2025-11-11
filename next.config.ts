import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    turbo: false,
  },
  // ✅ This is the correct mode for dynamic Supabase + runtime rendering
  output: "standalone",
};

export default nextConfig;
