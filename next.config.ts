import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      allowedOrigins: ["bcon.jahdev.com", "localhost:3101"],
    },
  },
  // Baseline security headers for EVERY response. middleware.ts already
  // stamps these on authenticated routes, but its matcher excludes /login,
  // /api/auth/*, static assets, etc. — this closes that gap. Values match
  // middleware.ts exactly so the two layers never disagree.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Field flows use mic dictation (daily-log notes), camera and
          // geolocation — self only; everything else denied by default.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
