// UI copy and sequential batch control shared by the review and focused tests.
export const MAX_MEZZANINE_FILE_BYTES = 20 * 1024 * 1024;
export const MEZZANINE_EXPORT_HELP = "Open Mezzanine, find its export option, and export your diary as a CSV or JSON file. Save the file, then choose it here.";
export function checkMezzanineFileSize(bytes: number) {
  if (bytes > MAX_MEZZANINE_FILE_BYTES) throw new Error("This file is too large. Choose a Mezzanine export smaller than 20 MB.");
}
export function attentionCopy(fields: string[]): string {
  const names: Record<string, string> = { show: "a show", venue: "a venue", city: "a city", country: "a country", date: "a valid date", rating: "a valid rating" };
  return fields.length ? `Needs ${fields.map((field) => names[field] ?? field).join(", ")}.` : "";
}
export async function runImportBatch<T>(items: T[], options: {
  shouldStop: () => boolean;
  save: (item: T, index: number) => Promise<void>;
  failed: (item: T, error: unknown) => void;
}) {
  let attempted = 0;
  for (const [index, item] of items.entries()) {
    if (options.shouldStop()) break;
    try { await options.save(item, index); }
    catch (error) { options.failed(item, error); }
    attempted++;
  }
  return { stopped: attempted < items.length, attempted };
}
