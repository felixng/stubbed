// Removes fields from the CMS documents that the schema no longer defines, which
// Studio reports as "Unknown fields found". Run with Node's native TypeScript
// support, like the seed script. Shows what it would remove; add --apply to do it.
import { createClient } from "@sanity/client";
import { copyDefinitions } from "../src/lib/cms/definitions";
import { documents, type ContentDocument, type CopySection } from "../src/lib/cms/model";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const token = process.env.SANITY_API_WRITE_TOKEN;
if (!projectId || !token) throw new Error("Set NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_WRITE_TOKEN.");
const apply = process.argv.includes("--apply");
const client = createClient({
  projectId,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2026-11-01",
  useCdn: false,
  token,
});

// Page-level fields that are not copy sections (see sanity.config.ts).
const extraFields: Partial<Record<ContentDocument, string[]>> = { aboutPage: ["sections"] };

let removed = 0;
let transaction = client.transaction();
for (const id of Object.keys(documents) as ContentDocument[]) {
  const sections = (Object.keys(copyDefinitions) as CopySection[]).filter((s) => copyDefinitions[s].document === id);
  for (const docId of [id, `drafts.${id}`]) {
    const doc = await client.getDocument<Record<string, unknown>>(docId);
    if (!doc) continue;
    const unknown: string[] = [];
    for (const [key, value] of Object.entries(doc)) {
      if (key.startsWith("_")) continue;
      if (extraFields[id]?.includes(key)) continue;
      if (!(sections as string[]).includes(key)) { unknown.push(key); continue; }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const known = Object.keys(copyDefinitions[key as CopySection].fields);
        for (const field of Object.keys(value)) {
          if (!field.startsWith("_") && !known.includes(field)) unknown.push(`${key}.${field}`);
        }
      }
    }
    if (!unknown.length) continue;
    console.log(`${docId}: ${unknown.join(", ")}`);
    removed += unknown.length;
    transaction = transaction.patch(docId, (patch) => patch.unset(unknown));
  }
}
if (!removed) console.log("No unknown fields found.");
else if (apply) { await transaction.commit(); console.log(`Removed ${removed} unknown fields.`); }
else console.log(`\n${removed} unknown fields would be removed. Run again with --apply to remove them.`);
