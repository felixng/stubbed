import assert from "node:assert/strict";
import { test } from "node:test";

import { POSTER_GROUNDS, posterDesign, posterFitSize, posterHash, posterMonogram } from "@/lib/poster";

test("posterHash: FNV-1a over the normalised title", () => {
  assert.equal(posterHash(""), 0x811c9dc5);
  assert.equal(posterHash("a"), 0xe40c292c);
  assert.equal(posterHash("Six"), posterHash("  six "));
  assert.equal(posterHash("La Bohème"), posterHash("la bohème"));
  assert.notEqual(posterHash("Six"), posterHash("Sixx"));
});

test("posterDesign: the same title always gets the same poster", () => {
  for (const title of ["Six", "Hadestown", "The Curious Incident of the Dog in the Night-Time"]) {
    assert.deepEqual(posterDesign(title), posterDesign(title));
    assert.deepEqual(posterDesign(title), posterDesign(title.toUpperCase()));
    const d = posterDesign(title);
    assert.ok(POSTER_GROUNDS.includes(d.ground));
    assert.ok(d.position === "top" || d.position === "bottom");
  }
});

test("posterDesign: titles spread across the grounds and positions", () => {
  const titles = ["Six", "Hadestown", "Wicked", "Hamilton", "Cats", "Les Misérables", "Company", "Cabaret", "Swan Lake", "Stomp"];
  const designs = titles.map(posterDesign);
  assert.equal(new Set(designs.map((d) => d.ground)).size, 3);
  assert.equal(new Set(designs.map((d) => d.position)).size, 2);
});

test("posterMonogram: two initials, skipping articles and minor words", () => {
  assert.equal(posterMonogram("Six"), "S");
  assert.equal(posterMonogram("Swan Lake"), "SL");
  assert.equal(posterMonogram("The Curious Incident of the Dog in the Night-Time"), "CI");
  assert.equal(posterMonogram("Death of a Salesman"), "DS");
  assert.equal(posterMonogram("La Bohème"), "B");
  assert.equal(posterMonogram("The Play That Goes Wrong"), "PG");
  assert.equal(posterMonogram("élan vital"), "ÉV");
  assert.equal(posterMonogram("1984"), "");
  assert.equal(posterMonogram("42nd Street"), "4S");
});

test("posterFitSize: short titles cap, long titles shrink", () => {
  assert.equal(posterFitSize("Six"), 28);
  assert.equal(posterFitSize("Six", 30), 30);
  const long = posterFitSize("The Curious Incident of the Dog in the Night-Time");
  assert.ok(long < 15 && long > 8, String(long));
  // The longest word sets the limit: 15 letters fit across ~78% of the width.
  assert.ok(Math.abs(posterFitSize("Supercalifragil") - 122 / 15) < 0.01);
  assert.ok(posterFitSize("") > 0);
});
