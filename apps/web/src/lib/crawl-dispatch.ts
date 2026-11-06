import { UUID } from "./admin-crawl";

export const CRAWL_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;
export type CrawlInput = { pipeline?: "discover" | "legacy"; venue_ids: string[]; method: "rules" | "rules_model"; model: string; prompt: string | null; budget_usd: number; branch: string; kind: "whats_on" | "show_names" };
export function crawlInput(value: unknown): CrawlInput {
  if (!value || typeof value !== "object") throw new Error("Invalid settings");
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.venue_ids) || v.venue_ids.length < 1 || v.venue_ids.length > 10 || !v.venue_ids.every(id => typeof id === "string" && UUID.test(id)) || new Set(v.venue_ids).size !== v.venue_ids.length) throw new Error("Choose 1–10 different theatres");
  if (v.pipeline != null && v.pipeline !== "discover" && v.pipeline !== "legacy") throw new Error("Invalid pipeline");
  if (v.method !== "rules" && v.method !== "rules_model") throw new Error("Invalid method");
  if (typeof v.model !== "string" || !(CRAWL_MODELS as readonly string[]).includes(v.model)) throw new Error("Invalid model");
  if (typeof v.budget_usd !== "number" || !Number.isFinite(v.budget_usd) || v.budget_usd < 0 || v.budget_usd > 10 || (v.method === "rules_model" && v.budget_usd === 0)) throw new Error("Budget must be between $0 and $10; model runs need a positive budget");
  if (typeof v.branch !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/.test(v.branch) || v.branch.includes("..") || v.branch.endsWith("/")) throw new Error("Invalid branch");
  if (v.prompt != null && (typeof v.prompt !== "string" || v.prompt.length > 20000)) throw new Error("Prompt is too long");
  if (v.kind !== "whats_on" && v.kind !== "show_names") throw new Error("Invalid job");
  return v as CrawlInput;
}

export async function dispatchCrawl(id: string, branch: string, token: string, fetcher = fetch) {
  const response = await fetcher("https://api.github.com/repos/felixng/stubbed/actions/workflows/catalogue-crawl.yml/dispatches", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: branch, inputs: { run_id: id } }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Could not start GitHub Actions. Check the branch and repository Actions token.");
}

// Authorization precedes parsing and dispatch so rejected callers cannot create
// runs or use the Actions token. Dependencies keep this path testable offline.
export async function startCrawlRequest(request: Request, deps: {
  admin: boolean;
  token?: string;
  create: (input: CrawlInput) => Promise<string | null>;
  fail: (id: string) => Promise<void>;
  dispatch?: typeof dispatchCrawl;
}) {
  if (!deps.admin) return Response.json({ error: "Not found" }, { status: 404 });
  let input;
  try { input = crawlInput(await request.json()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid settings" }, { status: 400 }); }
  if (!deps.token) return Response.json({ error: "Crawl dispatch is not configured. Add CRAWL_GITHUB_TOKEN in Vercel." }, { status: 503 });
  const id = await deps.create(input);
  if (!id) return Response.json({ error: "Could not create run. Check the selected theatres and settings." }, { status: 400 });
  try { await (deps.dispatch ?? dispatchCrawl)(id, input.branch, deps.token); }
  catch {
    await deps.fail(id);
    return Response.json({ error: "GitHub Actions could not start. The run is marked failed; check the branch and Actions token." }, { status: 502 });
  }
  return Response.json({ id }, { status: 201 });
}
