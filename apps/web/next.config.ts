import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Next.js checks every page for "instant navigation" and shows an error panel for each one it cannot render.
  // Our screens wait for the browser's saved sign-in, so the panel covered every page, the sign-in form included.
  // 'manual-warning' keeps the check only for a segment that asks for it with `export const instant`.
  experimental: {
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
