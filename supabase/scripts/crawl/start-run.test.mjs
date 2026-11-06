import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRun } from './load.mjs';
test('Actions run records its log link and exact code revision', async () => {
  const saved = { ...process.env };
  Object.assign(process.env, { GITHUB_REF_NAME: 'test/branch', GITHUB_SHA: 'abc123', GITHUB_RUN_ID: '123' });
  try {
    await startRun('a0000000-0000-0000-0000-000000000001', async sql => {
      assert.match(sql, /test\/branch/);
      assert.match(sql, /abc123/);
      assert.match(sql, /https:\/\/github.com\/felixng\/stubbed\/actions\/runs\/123/);
      return [];
    });
  } finally { process.env = saved; }
});
