const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQueuedArticleFromIngested } = require('./ingest-workflow-utils.js');

test('buildQueuedArticleFromIngested keeps ingested items in the queue by default', () => {
  const article = buildQueuedArticleFromIngested(
    {
      title: 'Test article',
      source: 'ReliefWeb',
      url: 'https://example.org/test',
      date: '2026-07-26',
      region: 'NE Region',
      subject: 'Security',
      summary: 'A test summary',
      extractedFacts: ['Fact one'],
      confidence: 'High',
    },
    42,
  );

  assert.equal(article.id, 42);
  assert.equal(article.status, 'Queued');
  assert.equal(article.extractedSummary, 'A test summary');
  assert.deepEqual(article.extractedFacts, ['Fact one']);
});
