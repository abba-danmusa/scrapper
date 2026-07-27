/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { getRandomUserAgent, isUrlAllowedByRobotsTxt, robotsCache } = require('../src/ingest/sources/html');

test('getRandomUserAgent returns a valid agent string', () => {
  const ua = getRandomUserAgent();
  assert.equal(typeof ua, 'string');
  assert.ok(ua.length > 10);
});

test('isUrlAllowedByRobotsTxt respects disallowed rules', async () => {
  const mockDomain = 'https://mocksite.com';
  // Seed the cache to avoid network calls
  robotsCache.set(mockDomain, {
    disallowedPaths: ['/admin', '/private/*'],
    allowedPaths: ['/public']
  });

  // Allowed by default (not matching disallowed paths)
  assert.equal(await isUrlAllowedByRobotsTxt(`${mockDomain}/about`), true);

  // Explicitly allowed
  assert.equal(await isUrlAllowedByRobotsTxt(`${mockDomain}/public/info`), true);

  // Disallowed prefix match
  assert.equal(await isUrlAllowedByRobotsTxt(`${mockDomain}/admin/settings`), false);

  // Disallowed wildcard match
  assert.equal(await isUrlAllowedByRobotsTxt(`${mockDomain}/private/secret/key`), false);
});
