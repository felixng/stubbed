import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Public profiles live at /@handle. A folder can't start with "@" (that's a
  // parallel route slot), so the page is app/(public)/u/[handle] behind this
  // rewrite.
  rewrites: async () => [
    // Universal links for the iOS app (#77).
    { source: "/.well-known/apple-app-site-association", destination: "/api/apple-app-site-association" },
    { source: "/@:handle", destination: "/u/:handle" },
    { source: "/@:handle/:list(followers|following)", destination: "/u/:handle/:list" },
  ],
  // Trips moved under Profile (Home · Log · Profile); old links still work.
  redirects: async () => [{ source: "/app/trips", destination: "/app/profile?view=trips", permanent: false }],
  // The link-preview images read their fonts from disk (lib/og.tsx).
  outputFileTracingIncludes: {
    "/api/og/**": ["./assets/fonts/*.ttf"],
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
