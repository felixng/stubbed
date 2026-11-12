import assert from "node:assert/strict";
import { test } from "node:test";
import { copyDefinitions } from "../src/lib/cms/definitions";
import { defaultsFor, documents, mergeCopy, safeEmail, safeWebUrl, seedDocuments } from "../src/lib/cms/model";
import { aboutDefaultSections, cleanSections, safeHref } from "../src/lib/cms/sections";
import { FAQ_SECTIONS } from "../src/lib/faq";

test("partial or malformed CMS content preserves repository copy and cannot introduce asset fields", () => {
  const defaults = defaultsFor("sharingLanding");
  for (const invalid of [null, undefined, [], "copy", 1]) {
    assert.deepEqual(mergeCopy("sharingLanding", invalid), defaults);
  }
  assert.deepEqual(mergeCopy("sharingLanding", {
    headline: "A new headline",
    signup: "",
    placeholderImage: { _type: "image", asset: "untrusted" },
    intro: "x".repeat(20_001),
    src: "https://example.com/replacement.jpg",
    __proto__: { hacked: true },
  }), { ...defaults, headline: "A new headline", signup: "" });
});

test("a cleared field stays cleared; a missing one falls back", () => {
  const defaults = defaultsFor("sharingLanding");
  assert.equal(mergeCopy("sharingLanding", { eyebrow: "" }).eyebrow, "");
  assert.equal(mergeCopy("sharingLanding", {}).eyebrow, defaults.eyebrow);
});

test("copy is plain text; markup remains a string for React to escape", () => {
  const html = '<script>alert("test")</script>';
  assert.equal(mergeCopy("sharingLanding", { headline: html }).headline, html);
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
  assert.equal(safeWebUrl("https://www.instagram.com/getstubbed.app/", fallback), "https://www.instagram.com/getstubbed.app/");
  for (const value of ["invalid", "a@example.com?subject=injection", "a@example.com\nBcc:x@example.com"]) {
    assert.equal(safeEmail(value, "support@getstubbed.app"), "support@getstubbed.app");
  }
  assert.equal(safeEmail("felix@getstubbed.app", "fallback"), "felix@getstubbed.app");
});

test("page sections: defaults survive cleaning, and an empty list is a real choice", () => {
  const defaults = aboutDefaultSections();
  assert.deepEqual(cleanSections(JSON.parse(JSON.stringify(defaults))), defaults);
  assert.deepEqual(cleanSections([]), []);
  assert.equal(cleanSections(undefined), null);
  assert.equal(cleanSections("nope"), null);
});

test("page sections drop unsafe links, unknown marks and malformed entries", () => {
  for (const href of ["javascript:alert(1)", "//evil.example", "http://example.com", "mailto:a@b.co?subject=x", "https://u:p@example.com", "data:text/html,x"]) {
    assert.equal(safeHref(href), null, href);
  }
  for (const href of ["/faq", "https://example.com/a", "mailto:felix@getstubbed.app"]) assert.ok(safeHref(href), href);
  const [section] = cleanSections([{
    _key: "a", heading: "Hi", divider: true,
    body: [
      { _type: "block", _key: "b1", style: "h1", markDefs: [{ _type: "link", _key: "l1", href: "javascript:alert(1)" }],
        children: [{ _type: "span", _key: "c1", text: "x", marks: ["l1", "script", "strong"] }] },
      { _type: "image", _key: "b2" },
    ],
    buttons: [{ _key: "x", label: "Bad", href: "javascript:1" }, { _key: "y", label: "Ok", href: "/signup", variant: "other" }],
  }, null, "junk"])!;
  assert.equal(section.body.length, 1);
  assert.equal(section.body[0].style, "normal");
  assert.deepEqual(section.body[0].markDefs, []);
  assert.deepEqual(section.body[0].children[0].marks, ["strong"]);
  assert.deepEqual(section.buttons.map((b) => [b.label, b.variant]), [["Ok", "primary"]]);
});

test("draft-preview markers are stripped before links are validated", () => {
  const marker = "\u200b";
  const [section] = cleanSections([{ _key: "a", heading: "", body: [], buttons: [{ _key: "b", label: "Go", href: `/faq${marker}`, variant: `ghost${marker}` }] }],
    (value) => value.replaceAll(marker, ""))!;
  assert.deepEqual(section.buttons.map((b) => [b.href, b.variant]), [["/faq", "ghost"]]);
});
