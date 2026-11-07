import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalTaskUrl } from './frontier-url.mjs';

const options = { base: 'https://theatre.example/directory', allowedHosts: ['theatre.example'] };

test('pagination, locale and event filters remain distinct while tracking variants collapse', () => {
  const links = [
    '?page=1',
    '?page=2&locale=en-GB&event=First%20Night&tag=play&tag=musical',
    '?page=2&utm_source=email&locale=en-GB&event=First%20Night&tag=play&tag=musical#results',
    '?page=2&locale=en-GB&event=First%20Night&tag=play&tag=musical&gclid=abc',
  ].map(link => canonicalTaskUrl(link, options));
  assert.notEqual(links[0], links[1]);
  assert.equal(links[1], options.base + '?page=2&locale=en-GB&event=First%20Night&tag=play&tag=musical');
  assert.equal(links[1], links[2]);
  assert.equal(links[1], links[3]);
});

test('frontier rejects off-host links, credentials, non-HTTP URLs and non-default ports', () => {
  for (const link of [
    '//theatre.example.other.test/event',
    'https://theatre.example@127.0.0.1/event',
    'https://user:password@theatre.example/event',
    'https://theatre.example:8443/event',
    'ftp://theatre.example/event',
    'javascript:alert(1)',
  ]) {
    assert.equal(canonicalTaskUrl(link, options), null, link);
  }
});
