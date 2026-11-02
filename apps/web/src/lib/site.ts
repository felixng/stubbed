// The public origin, for canonical links, Open Graph URLs and the sitemap.
// Set NEXT_PUBLIC_SITE_URL once there's a custom domain; until then Vercel's
// production domain is used, and localhost in development.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const SITE_URL = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    (vercelHost ? `https://${vercelHost}` : "http://localhost:3000"),
);

export const SITE_NAME = "Stubbed";
