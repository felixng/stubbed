import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSql, parseCli, CANDIDATES_SQL } from './merge.mjs';

const A = '5a000274-0000-0000-0000-000000000001';
const B = '5a000274-0000-0000-0000-000000000002';

test('a merge rolls back unless applied', () => {
  assert.match(mergeSql({ kind: 'shows', from: A, into: B }), /merge_shows\('.*', '.*', false\);\nrollback;$/);
  assert.match(mergeSql({ kind: 'shows', from: A, into: B, force: true, apply: true }), /, true\);\ncommit;$/);
  assert.match(mergeSql({ kind: 'venues', from: A, into: B, apply: true }), /merge_venues\('.*', '.*'\);\ncommit;$/);
});

test('ids must be UUIDs, so nothing else reaches the SQL', () => {
  assert.throws(() => mergeSql({ kind: 'venues', from: "x'); drop table public.entries; --", into: B }), /UUIDs/);
  assert.throws(() => mergeSql({ kind: 'shows', from: A, into: 'nope' }), /UUIDs/);
});

test('parses the command line', () => {
  assert.deepEqual(parseCli([]).ids, []);
  assert.equal(parseCli(['--shows', A, B, '--force']).force, true);
  assert.deepEqual(parseCli(['--venues', A, B, '--apply']).ids, [A, B]);
  assert.throws(() => parseCli(['--shows', A]), /two ids/);
  assert.throws(() => parseCli(['--shows', '--venues', A, B]), /not both/);
  assert.throws(() => parseCli(['--venues', A, B, '--force']), /--force/);
  assert.throws(() => parseCli(['--apply']), /Unexpected/);
});

test('the duplicate scan is read only and one line per result', () => {
  assert.match(CANDIDATES_SQL, /^begin transaction read only;/);
  assert.match(CANDIDATES_SQL, /jsonb_agg/);
  assert.doesNotMatch(CANDIDATES_SQL, /\bjson_agg/);
});
