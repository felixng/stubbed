import assert from "node:assert/strict";
import test from "node:test";
import { normalizedCrop, squareCrop } from "../src/lib/photo-crop";

test("centers the largest square on portrait, landscape and tiny photos", () => {
  assert.deepEqual(squareCrop(1600, 800), { x: 400, y: 0, side: 800 });
  assert.deepEqual(squareCrop(800, 1600), { x: 0, y: 400, side: 800 });
  assert.deepEqual(squareCrop(1, 3), { x: 0, y: 1, side: 1 });
});

test("bounds panning and zoom and normalizes against each source dimension", () => {
  const crop = squareCrop(1600, 800, 1800, -30, 400);
  assert.deepEqual(crop, { x: 1200, y: 0, side: 400 });
  assert.deepEqual(normalizedCrop(crop, 1600, 800), [0.75, 0, 0.25, 0.5]);
  assert.equal(squareCrop(1600, 800, 800, 400, 0).side, 1);
});
