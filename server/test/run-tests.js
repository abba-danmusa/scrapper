/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('assert');
const { ingestPipeline } = require('../src/ingest/pipeline');
const { readSnapshot } = require('../src/ingest/store');

(async function run() {
  console.log('Running pipeline smoke test (no external keys required)');

  const result = await ingestPipeline({ enabledSources: [] });
  assert.strictEqual(result.ok, true);
  assert.ok(Array.isArray(result.articles));

  console.log('ingestPipeline returned', result.count, 'articles');

  // Test that snapshot is readable (may be null if pipeline returned zero)
  const snapshot = readSnapshot();
  console.log('Snapshot read:', snapshot ? `${snapshot.count} articles` : 'no snapshot found');

  console.log('All smoke checks passed');
})();
