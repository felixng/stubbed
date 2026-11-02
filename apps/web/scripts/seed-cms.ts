// Run with Node's native TypeScript support (Node 22+), using the same
// extension-resolution hook as tests so this needs no extra runtime package.
import { createClient } from "@sanity/client";
import { seedDocuments } from "../src/lib/cms/model";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const token = process.env.SANITY_API_WRITE_TOKEN;
if (!projectId || !token) throw new Error("Set NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_WRITE_TOKEN to seed Sanity.");
const client = createClient({
  projectId,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2026-11-01",
  useCdn: false,
  token,
});
// Never replace editorial changes. Safe to repeat after interrupted setup.
let transaction = client.transaction();
for (const document of seedDocuments()) transaction = transaction.createIfNotExists(document);
await transaction.commit();
console.log("Created missing public-copy documents. Existing editorial content was preserved.");
