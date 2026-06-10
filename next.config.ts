import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      allowedOrigins: ["bcon.jahdev.com", "localhost:3101"],
    },
  },
};

export default nextConfig;
