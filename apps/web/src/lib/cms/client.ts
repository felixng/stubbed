import { createClient } from "next-sanity";

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
export const apiVersion = "2026-11-01";

// No account configuration is required for ordinary local development or CI.
export const cmsClient = projectId ? createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  timeout: 5000,
  maxRetries: 1,
  perspective: "published",
  stega: { studioUrl: "/dressingroom" },
}) : null;
