import { test } from "node:test";
import assert from "node:assert/strict";
import { crawlInput, dispatchCrawl } from "../src/lib/crawl-dispatch";
const valid = { venue_ids: ["a0000000-0000-0000-0000-000000000001"], method: "rules", model: "claude-haiku-5-5", prompt: null, budget_usd: 0, branch: "main", kind: "whats_on" };
test("crawl settings reject invalid models, duplicate or over-limit theatres, budgets and branches", () => {
  assert.deepEqual(crawlInput(valid), valid);
  for (const patch of [{ model: "unknown" }, { venue_ids: [] }, { venue_ids: Array(11).fill(valid.venue_ids[0]) }, { venue_ids: Array(2).fill(valid.venue_ids[0]) }, { budget_usd: -1 }, { budget_usd: 11 }, { budget_usd: NaN }, { method: "rules_model" }, { branch: "../main" }, { prompt: "x".repeat(20001) }]) assert.throws(() => crawlInput({ ...valid, ...patch }));
});
test("dispatch sends only the saved run id to the selected branch", async () => {
  let calls = 0;
  await dispatchCrawl("run-id", "test/branch", "secret", async (url, options) => {
    calls++;
    assert.equal(url, "https://api.github.com/repos/felixng/stubbed/actions/workflows/catalogue-crawl.yml/dispatches");
    assert.deepEqual(JSON.parse(options!.body as string), { ref: "test/branch", inputs: { run_id: "run-id" } });
    assert.equal((options!.headers as Record<string, string>).Authorization, "Bearer secret");
    return new Response(null, { status: 204 });
  });
  assert.equal(calls, 1);
  await assert.rejects(dispatchCrawl("run-id", "main", "secret", async () => new Response(null, { status: 403 })));
});
test("non-admin requests are refused before creating or dispatching", async () => {
  const { startCrawlRequest } = await import("../src/lib/crawl-dispatch");
  const unexpected = async () => { throw new Error("Must not run"); };
  const response = await startCrawlRequest(new Request("https://example.com", { method: "POST", body: JSON.stringify(valid) }), { admin: false, create: unexpected, fail: unexpected, dispatch: unexpected });
  assert.equal(response.status, 404);
});
test("dispatch failures mark the saved run failed; successful dispatch returns its id", async () => {
  const { startCrawlRequest } = await import("../src/lib/crawl-dispatch");
  const request = () => new Request("https://example.com", { method: "POST", body: JSON.stringify(valid) });
  const failed: string[] = [];
  const deps = { admin: true, token: "secret", create: async () => "saved-id", fail: async (id: string) => { failed.push(id); } };
  const error = await startCrawlRequest(request(), { ...deps, dispatch: async () => { throw new Error("403"); } });
  assert.equal(error.status, 502); assert.deepEqual(failed, ["saved-id"]);
  const success = await startCrawlRequest(request(), { ...deps, dispatch: async () => {} });
  assert.equal(success.status, 201); assert.deepEqual(await success.json(), { id: "saved-id" });
});
test("manual discovery accepts theatre IDs without a preconfigured link and validates its pipeline", () => {
  assert.equal(crawlInput({ ...valid, pipeline: "discover" }).pipeline, "discover");
  assert.equal(crawlInput({ ...valid, pipeline: "legacy" }).pipeline, "legacy");
  assert.throws(() => crawlInput({ ...valid, pipeline: "unknown" }));
});
