import assert from "node:assert/strict";
import { test } from "node:test";
import { copyDefinitions } from "../src/lib/cms/definitions";
import { defaultsFor, documents, mergeCopy, safeEmail, safeWebUrl, seedDocuments } from "../src/lib/cms/model";
import { FAQ_SECTIONS } from "../src/lib/faq";

test("partial or malformed CMS content preserves repository copy and cannot introduce asset fields", () => {
  const defaults = defaultsFor("hero");
  for (const invalid of [null, undefined, [], "copy", 1]) {
    assert.deepEqual(mergeCopy("hero", invalid), defaults);
  }
  assert.deepEqual(mergeCopy("hero", {
    yourTheatreLifeShared: "A new headline",
    signUpFree: " ",
    signIn: { _type: "image", asset: "untrusted" },
    logTheShowsYouSeeRate: "x".repeat(20_001),
    src: "https://example.com/replacement.jpg",
    __proto__: { hacked: true },
  }), { ...defaults, yourTheatreLifeShared: "A new headline" });
});

test("copy is plain text; markup remains a string for React to escape", () => {
  const html = '<script>alert("test")</script>';
  assert.equal(mergeCopy("hero", { yourTheatreLifeShared: html }).yourTheatreLifeShared, html);
});

test("seed includes every singleton and only the explicitly editable fields", () => {
  const seeds = seedDocuments();
  assert.deepEqual(seeds.map((document) => document._id).sort(), Object.keys(documents).sort());
  for (const [section, definition] of Object.entries(copyDefinitions)) {
    const document = seeds.find((entry) => entry._id === definition.document)!;
    assert.ok(document, `Missing document for ${section}`);
    const values = (document as Record<string, unknown>)[section] as Record<string, string>;
    assert.deepEqual(Object.keys(values), Object.keys(definition.fields));
    for (const [field, value] of Object.entries(values)) {
      assert.equal(typeof value, "string", `${section}.${field}`);
      assert.ok(value.trim(), `${section}.${field} needs a default`);
      // File paths cannot be entered or changed through copy schemas.
      assert.ok(!/^\/(landing|press|brand)\//.test(value), `${section}.${field} exposes an asset`);
    }
  }
});

test("every FAQ question, answer, instruction and link label has a migrated default", () => {
  const values = defaultsFor("faqEntries") as Record<string, string>;
  for (const [index, section] of FAQ_SECTIONS.entries()) {
    assert.equal(values[`section${index}Title`], section.title);
    for (const item of section.items) {
      const key = item.id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      assert.equal(values[`${key}Question`], item.question);
      assert.equal(values[`${key}Answer`], item.answer);
      item.steps?.forEach((step, i) => assert.equal(values[`${key}Step${i}`], step));
      if (item.link) assert.equal(values[`${key}LinkLabel`], item.link.label);
    }
  }
});

test("CMS contact links reject executable schemes, credentials and malformed emails", () => {
  const fallback = "https://getstubbed.app/";
  for (const value of ["javascript:alert(1)", "data:text/html,test", "//example.com", "http://example.com", "https://user:password@example.com", "not a url"]) {
    assert.equal(safeWebUrl(value, fallback), fallback);
  }
  assert.equal(safeWebUrl("https://www.instagram.com/stubbedapp/", fallback), "https://www.instagram.com/stubbedapp/");
  for (const value of ["invalid", "a@example.com?subject=injection", "a@example.com\nBcc:x@example.com"]) {
    assert.equal(safeEmail(value, "support@getstubbed.app"), "support@getstubbed.app");
  }
  assert.equal(safeEmail("felix@getstubbed.app", "fallback"), "felix@getstubbed.app");
});
