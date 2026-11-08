import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadSuggestions, normaliseSuggestions, SuggestionSession, type SuggestionFetcher } from "@/lib/show-suggestions";

const row = (n: number, source = "community", venue = "v1") => ({
  show_id: `s${n}`,
  title: `Show ${n}`,
  venue_id: venue,
  source,
  score: 1,
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("normaliseSuggestions", () => {
  it("keeps valid rows, drops malformed ones and non-arrays", () => {
    assert.deepEqual(normaliseSuggestions(null), []);
    assert.deepEqual(normaliseSuggestions({}), []);
    const out = normaliseSuggestions([row(1), { title: 3 }, null, { ...row(2), show_id: 5 }, row(3)]);
    assert.deepEqual(out.map((s) => s.show_id), ["s1", "s3"]);
  });
  it("caps each source at three and dedupes show+venue", () => {
    const rows = [row(1), row(2), row(3), row(4), row(1), row(5, "yours"), row(1, "yours")];
    const out = normaliseSuggestions(rows);
    assert.deepEqual(out.map((s) => `${s.source}:${s.show_id}`), ["community:s1", "community:s2", "community:s3", "yours:s5"]);
  });
});

describe("loadSuggestions", () => {
  it("returns [] when the call fails or times out, never throws", async () => {
    assert.deepEqual(await loadSuggestions(async () => { throw new Error("rpc"); }, "v1", "2026-10-05"), []);
    assert.deepEqual(await loadSuggestions(() => new Promise(() => {}), "v1", "2026-10-05", 20), []);
  });
  it("returns [] for an empty catalogue", async () => {
    assert.deepEqual(await loadSuggestions(async () => [], "v1", "2026-10-05"), []);
  });
});

describe("SuggestionSession", () => {
  it("debounces rapid changes to one request", async () => {
    let calls = 0;
    const fetcher: SuggestionFetcher = async () => { calls++; return [row(1)]; };
    const s = new SuggestionSession(fetcher, { debounceMs: 20, timeoutMs: 100 });
    const results: number[] = [];
    for (let i = 0; i < 4; i++) s.request("v1", `2026-10-0${i + 1}`, (items) => results.push(items.length));
    await wait(80);
    assert.equal(calls, 1);
    assert.deepEqual(results, [1]);
  });
  it("ignores a late response after the venue or date changed", async () => {
    const results: string[] = [];
    const slow: SuggestionFetcher = (ids) => new Promise((r) => setTimeout(() => r([row(ids[0] === "old" ? 1 : 2, "community", ids[0])]), ids[0] === "old" ? 60 : 5));
    const s = new SuggestionSession(slow, { debounceMs: 1, timeoutMs: 200 });
    s.request("old", "2026-10-05", (i) => results.push(i[0].venue_id));
    await wait(15);
    s.request("new", "2026-10-05", (i) => results.push(i[0].venue_id));
    await wait(120);
    assert.deepEqual(results, ["new"]);
  });
  it("drops a response after cancel (save, navigation, unmount)", async () => {
    const results: number[] = [];
    const s = new SuggestionSession(async () => [row(1)], { debounceMs: 10, timeoutMs: 100 });
    s.request("v1", "2026-10-05", (i) => results.push(i.length));
    s.cancel();
    await wait(50);
    assert.equal(results.length, 0);
    const slow = new SuggestionSession(() => wait(40).then(() => [row(1)]), { debounceMs: 5, timeoutMs: 200 });
    slow.request("v1", "2026-10-05", (i) => results.push(i.length));
    await wait(20);
    slow.cancel(); // while the fetch is in flight
    await wait(60);
    assert.equal(results.length, 0);
  });
  it("delivers [] on RPC failure so the baseline route is untouched", async () => {
    const results: number[] = [];
    const s = new SuggestionSession(async () => { throw new Error("down"); }, { debounceMs: 1, timeoutMs: 50 });
    s.request("v1", "2026-10-05", (i) => results.push(i.length));
    await wait(30);
    assert.deepEqual(results, [0]);
  });
});
