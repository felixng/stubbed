// UI copy and sequential batch control shared by the review and focused tests.
export const MAX_MEZZANINE_FILE_BYTES = 20 * 1024 * 1024;
export const MEZZANINE_EXPORT_HELP = "Open Mezzanine, find its export option, and export your diary as a CSV or JSON file. Save the file, then choose it here.";
export function checkMezzanineFileSize(bytes: number) {
  if (bytes > MAX_MEZZANINE_FILE_BYTES) throw new Error("This file is too large. Choose a Mezzanine export smaller than 20 MB.");
}
export function attentionCopy(fields: string[]): string {
  const actions: Record<string, string> = { show: "Choose a show", venue: "Add a theatre", city: "Add a city", country: "Choose a country", date: "Add a date", rating: "Check the rating" };
  return fields.map((field) => actions[field] ?? `Check ${field}`).join(" · ");
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
