import type { NextConfig } from "next";

/**
 * Static security headers applied to every response.
 * The Content-Security-Policy is set per request in `src/proxy.ts`
 * because it carries a fresh script nonce.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Prisma's query engine must stay a Node.js external.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  experimental: {
    serverActions: {
      // Document uploads go through Server Actions (20 MB file limit + multipart overhead).
      bodySizeLimit: "21mb",
    },
    proxyClientMaxBodySize: "21mb",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages can never be framed. Document files set SAMEORIGIN themselves so the
      // in-app PDF / image preview works (see src/app/api/documents/[versionId]).
      { source: "/((?!api/documents/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
