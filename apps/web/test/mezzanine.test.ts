import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMezzanine, mezzanineDay } from "@/lib/import/mezzanine";
import { duplicateKey, isMezzanineDuplicate } from "@/lib/import/mezzanine-resolve";

const header = "date,show,theater,location,time,specialTags,customTags,seat,rating,review,notes";
const today = "2026-11-05";
const values = (date = "2026-10-01T00:00:00Z", rating = "4.5", review = "Review", city = "Test City") => [date, "Synthetic Show", "Example Theatre", city, "Evening", "", "", "A1", rating, review, "SECRET"];
const csv = (...args: Parameters<typeof values>) => values(...args).map((v) => `"${v.replaceAll('"', '""')}"`).join(",");
const parse = (text: string) => parseMezzanine(text, today);
test("normal CSV mapping excludes private notes", () => {
  assert.deepEqual(parse(header + "\n" + csv())[0], { show: "Synthetic Show", venue: "Example Theatre", city: "Test City", date: "2026-10-01", rating: 4.5, review: "Review", invalidRating: false, planned: false });
});
test("quoted commas, quotes, line breaks, Windows endings and BOM", () => {
  const review = 'Good, especially the "finale"\nSecond line';
  assert.equal(parse(("\uFEFF" + header + "\n" + csv(undefined, undefined, review)).replaceAll("\n", "\r\n"))[0].review, review);
});
test("rating rules flag out of range and round valid half stars", () => {
  for (const rating of ["", "0", "0.3", "7", "NaN", "4.24", "4.25", "5"]) {
    const row = parse(header + "\n" + csv(undefined, rating))[0];
    assert.equal(row.invalidRating, ["0.3", "7", "NaN"].includes(rating));
    if (["", "0"].includes(rating)) assert.equal(row.rating, null);
    if (rating === "4.24") assert.equal(row.rating, 4);
    if (rating === "4.25") assert.equal(row.rating, 4.5);
  }
});
test("missing and invalid calendar dates block saving", () => {
  for (const date of ["", "garbled", "2026-02-29T00:00:00Z", "2026-13-01", "10/01/2026"]) assert.equal(parse(header + "\n" + csv(date))[0].date, null);
  assert.equal(mezzanineDay("2024-02-29T00:00:00Z"), "2024-02-29");
});
test("calendar days never shift west of UTC and future entries lose ratings", () => {
  const previous = process.env.TZ;
  try { process.env.TZ = "America/Los_Angeles"; assert.equal(parse(header + "\n" + csv())[0].date, "2026-10-01"); }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  const future = parse(header + "\n" + csv("2027-01-01T00:00:00Z"))[0];
  assert.equal(future.planned, true); assert.equal(future.rating, null);
});
test("repeat visits stay separate, including same day, and city can be missing", () => {
  const rows = parse(header + "\n" + csv() + "\n" + csv() + "\n" + csv("2026-10-02", "", "", ""));
  assert.equal(rows.length, 3); assert.deepEqual(rows[0], rows[1]); assert.equal(rows[2].city, "");
});
test("CSV reads header names", () => {
  assert.equal(parse(header.split(",").reverse().join(",") + "\n" + values().reverse().join(","))[0].review, "Review");
});
test("JSON reads keys, ignores lists and notes, tolerates no production", () => {
  const rows = parse(JSON.stringify({ appVersion: "test", data: { lists: [], diaryEntries: [
    { review: "Public", notes: "SECRET", date: "2026-10-01T00:00:00Z", rating: 0, show: { name: "Synthetic Show" }, production: { theater: { name: "Example Theatre", location: "Test City" } } },
    { show: { name: "Another Show" }, rating: 4.5, date: "2026-10-02" },
  ] } }));
  assert.equal(rows[0].rating, null); assert.equal(rows[0].review, "Public"); assert.equal(rows[1].venue, "");
});
test("wrong, empty and malformed exports fail clearly", () => {
  for (const text of ["", "x,y\n1,2", "{}", '{"data":{"diaryEntries":[]}}', "[]", "not an export", header, header + '\n"unclosed']) assert.throws(() => parse(text));
});
test("review limited to 10000 characters", () => assert.equal(parse(header + "\n" + csv(undefined, undefined, "x".repeat(10001)))[0].review.length, 10000));
test("only existing resolved shows on the same day count as duplicates", () => {
  const existing = new Set([duplicateKey("show-id", "2026-10-01")]);
  assert.equal(isMezzanineDuplicate("show-id", "2026-10-01", existing), true);
  assert.equal(isMezzanineDuplicate(undefined, "2026-10-01", existing), false);
  assert.equal(isMezzanineDuplicate("show-id", "2026-10-02", existing), false);
  assert.equal(isMezzanineDuplicate("show-id", "2026-10-02", existing), false);
});

test("resolver caches names, preserves same-day visits and caps concurrent requests at three", async () => {
  const { resolveMezzanine } = await import("@/lib/import/mezzanine-resolve");
  const calls: string[] = []; let active = 0, peak = 0;
  const client = {
    rpc: async (name: string, args: Record<string, string>) => {
      active++; peak = Math.max(peak, active); calls.push(`${name}:${args.q ?? args.title}`);
      await new Promise((resolve) => setTimeout(resolve, 1)); active--;
      return { data: name === "similar_venues" ? [{ id: "venue", name: args.q, city: "Test City", country: "GB", same: true }] : name === "tidy_show_title" ? args.title : [], error: null };
    },
  };
  const rows = parse(header + "\n" + csv() + "\n" + csv() + "\n" + csv("2026-10-02"));
  const { drafts } = await resolveMezzanine(client as never, "owner", rows, "2026-11-05T00:00:00Z", () => {});
  assert.equal(drafts.length, 3); assert.ok(drafts.every((d) => d.include && !d.duplicate && d.venue?.country === "GB"));
  assert.equal(calls.filter((c) => c.startsWith("similar_shows:")).length, 1);
  assert.equal(calls.filter((c) => c.startsWith("similar_venues:")).length, 1);
  assert.ok(peak <= 3);
});
test("failed catalogue lookup rejects resolution rather than inventing a new show", async () => {
  const { resolveMezzanine } = await import("@/lib/import/mezzanine-resolve");
  const client = { rpc: async () => ({ data: null, error: new Error("offline") }) };
  await assert.rejects(resolveMezzanine(client as never, "owner", parse(header + "\n" + csv()), "2026-11-05T00:00:00Z", () => {}), /offline/);
});
test("duplicate query chunks ids, pages beyond 1000, filters owner and pre-import timestamp", async () => {
  const { existingMezzanineKeys } = await import("@/lib/import/mezzanine-resolve");
  const calls: { ids: string[]; owner: string; before: string; offset: number }[] = [];
  const client = { from: () => {
    const call = { ids: [] as string[], owner: "", before: "", offset: 0 };
    const query = {
      select: () => query, eq: (_: string, value: string) => { call.owner = value; return query; },
      in: (_: string, ids: string[]) => { call.ids = ids; return query; },
      lte: (_: string, value: string) => { call.before = value; return query; }, order: () => query,
      range: async (start: number) => {
        call.offset = start; calls.push(call);
        return { error: null, data: Array.from({ length: start < 1000 ? 500 : 1 }, (_, i) => ({ show_id: call.ids[0], date: `day-${start + i}` })) };
      },
    }; return query;
  } };
  const keys = await existingMezzanineKeys(client as never, "owner", Array.from({ length: 101 }, (_, i) => `show-${i}`), "2026-11-05T00:00:00Z");
  assert.equal(calls.length, 6); assert.equal(keys.size, 2002);
  assert.ok(calls.every((c) => c.ids.length <= 100 && c.owner === "owner" && c.before === "2026-11-05T00:00:00Z"));
  assert.deepEqual(calls.map((c) => c.offset), [0, 500, 1000, 0, 500, 1000]);
});
test("city aliases are canonicalised with the chosen country before comparing venues", async () => {
  const { canonicalMezzanineVenue } = await import("@/lib/import/mezzanine-resolve");
  const calls: Record<string, string>[] = [];
  const client = { rpc: async (_: string, args: Record<string, string>) => { calls.push(args); return { data: "New York", error: null }; } };
  const cache = new Map<string, string>();
  const venue = { name: "Synthetic Theatre", city: "New York City", country: "US" };
  const first = await canonicalMezzanineVenue(client as never, venue, cache);
  const second = await canonicalMezzanineVenue(client as never, venue, cache);
  assert.equal(first.city, "New York"); assert.equal(second.city, "New York");
  assert.deepEqual(calls, [{ city: "New York City", country: "US" }]);
});
test("file retry uses a stable entry id and profile visibility remains the database default", async () => {
  const { saveDraft } = await import("@/lib/import/resolve");
  const writes: Record<string, unknown>[] = [];
  const client = { from: (table: string) => {
    assert.equal(table, "entries");
    return { upsert: async (fields: Record<string, unknown>) => { writes.push(fields); return { error: null }; } };
  } };
  const draft = { show: { id: "show-id", title: "Synthetic Show", type: "musical" as const },
    venue: { id: "venue-id", name: "Example Theatre", city: "Test City", country: "GB" },
    date: "2026-10-01", rating: 4.5, note: "Public review", collectionIds: [], photo: null };
  await saveDraft(client as never, "owner", draft, "stable-row-id");
  await saveDraft(client as never, "owner", draft, "stable-row-id");
  assert.equal(writes.length, 2); assert.ok(writes.every((row) => row.id === "stable-row-id" && !("visibility" in row)));
});

test("Stop finishes the in-flight save and leaves later rows untouched", async () => {
  const { runImportBatch } = await import("@/lib/import/mezzanine-review");
  let stop = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const saved: number[] = [];
  const batch = runImportBatch([1, 2, 3], {
    shouldStop: () => stop,
    save: async (row) => { saved.push(row); await gate; },
    failed: () => assert.fail("Save should succeed"),
  });
  assert.deepEqual(saved, [1]); stop = true; release();
  assert.deepEqual(await batch, { stopped: true, attempted: 1 });
  assert.deepEqual(saved, [1]);
});
test("a row failure is retained without preventing later saves", async () => {
  const { runImportBatch } = await import("@/lib/import/mezzanine-review");
  const saved: number[] = [], failed: number[] = [];
  const result = await runImportBatch([1, 2, 3], {
    shouldStop: () => false,
    save: async (row) => { if (row === 2) throw new Error("offline"); saved.push(row); },
    failed: (row) => failed.push(row),
  });
  assert.deepEqual(saved, [1, 3]); assert.deepEqual(failed, [2]); assert.equal(result.stopped, false);
});
test("exports over 20 MB are rejected before reading, and attention copy names the fix", async () => {
  const { checkMezzanineFileSize, MAX_MEZZANINE_FILE_BYTES, attentionCopy } = await import("@/lib/import/mezzanine-review");
  assert.doesNotThrow(() => checkMezzanineFileSize(MAX_MEZZANINE_FILE_BYTES));
  assert.throws(() => checkMezzanineFileSize(MAX_MEZZANINE_FILE_BYTES + 1), /smaller than 20 MB/);
  assert.equal(attentionCopy(["country"]), "Needs a country.");
  assert.equal(attentionCopy(["date", "rating"]), "Needs a valid date, a valid rating.");
});
test("Stop during matching does not start later batches or query diary entries", async () => {
  const { resolveMezzanine, MezzanineStopped } = await import("@/lib/import/mezzanine-resolve");
  const rows = Array.from({ length: 30 }, (_, i) => ({ ...parse(header + "\n" + csv())[0], show: `Synthetic ${i}` }));
  let done = 0, requests = 0;
  const client = { rpc: async (name: string, args: Record<string, string>) => {
    requests++; return { error: null, data: name === "tidy_show_title" ? args.title : [] };
  } };
  await assert.rejects(resolveMezzanine(client as never, "owner", rows, "2026-11-06T00:00:00Z", (count) => { done = count; }, () => done >= 3), MezzanineStopped);
  assert.equal(done, 3); assert.ok(requests <= 6);
});
