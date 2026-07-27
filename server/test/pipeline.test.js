/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');

const { ingestPipeline } = require('../src/ingest/pipeline');
const { readSnapshot, getHealthSummary, readHealthState, saveWorkspace, getWorkspaceById } = require('../src/ingest/store');

const samplePayload = {
  startDate: '2026-06-01',
  endDate: '2026-06-18',
  subjects: ['Food Security', 'Health', 'Security'],
  regions: ['NE Region', 'NW Region'],
  enabledSources: ['ReliefWeb', 'RSS']
};

test('ingestPipeline returns normalized and deduped output', async () => {
  const result = await ingestPipeline(samplePayload);

  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.articles));
  assert.equal(typeof result.count, 'number');
  assert.ok(result.count >= 0);
  result.articles.forEach((article) => {
    assert.ok(article.title);
    assert.ok(article.url);
    assert.ok(article.source);
    assert.ok(['High', 'Medium', 'Low'].includes(article.confidence));
  });
});

test('ingestPipeline handles empty enabled sources gracefully', async () => {
  const result = await ingestPipeline({
    ...samplePayload,
    enabledSources: []
  });

  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
  assert.deepEqual(result.articles, []);
});

test('ingestPipeline continues when one source throws', async () => {
  const result = await ingestPipeline({
    ...samplePayload,
    enabledSources: ['ReliefWeb', 'HTML'],
    sourceFunctions: {
      searchReliefWeb: async () => {
        throw new Error('ReliefWeb unavailable');
      },
      searchHtmlSources: async () => [
        {
          title: 'Fallback HTML article',
          source: 'HTML',
          url: 'https://example.com/html',
          date: '2026-06-17',
          region: 'National Overview',
          subject: 'Security',
          rawText: 'A resilient fallback article.'
        }
      ]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.articles[0].source, 'HTML');
  assert.equal(result.articles[0].title, 'Fallback HTML article');
});

test('ingestPipeline writes a snapshot that can be read back', async () => {
  const result = await ingestPipeline({
    ...samplePayload,
    enabledSources: ['HTML'],
    sourceFunctions: {
      searchHtmlSources: async () => [
        {
          title: 'Persisted HTML article',
          source: 'HTML',
          url: 'https://example.com/persisted',
          date: '2026-06-18',
          region: 'National Overview',
          subject: 'Security',
          rawText: 'Persisted via snapshot test.'
        }
      ]
    }
  });

  assert.equal(result.ok, true);
  const snapshot = readSnapshot();
  const healthSummary = getHealthSummary();
  const healthState = readHealthState();
  assert.ok(snapshot);
  assert.equal(snapshot.count, result.count);
  assert.ok(snapshot.articles.some((article) => article.title === 'Persisted HTML article'));
  assert.ok(Array.isArray(healthSummary.sourceHealth));
  assert.ok(healthSummary.sourceHealth.some((entry) => entry.name === 'HTML'));
  assert.ok(Array.isArray(healthState?.runHistory));
  assert.ok(healthState.runHistory.some((entry) => entry.count === result.count));
});

test('ingestPipeline enriches articles with summaries and facts', async () => {
  const result = await ingestPipeline({
    ...samplePayload,
    enabledSources: ['HTML'],
    sourceFunctions: {
      searchHtmlSources: async () => [
        {
          title: 'Enriched HTML article',
          source: 'HTML',
          url: 'https://example.com/enriched',
          date: '2026-06-18',
          region: 'NE Region',
          subject: 'Security',
          rawText: 'A convoy was attacked near Maiduguri during the reporting window.'
        }
      ]
    }
  });

  assert.equal(result.ok, true);
  assert.ok(result.articles[0].summary);
  assert.ok(Array.isArray(result.articles[0].extractedFacts));
  assert.ok(result.articles[0].extractedFacts.some((fact) => fact.includes('Headline')));
});

test('getHealthSummary exposes the latest persisted workspace metadata', () => {
  saveWorkspace({
    id: 'health-summary-123',
    title: 'Health summary report',
    status: 'draft',
    parameters: { title: 'Health summary report', startDate: '2026-06-01', endDate: '2026-06-18', classification: 'Public Draft', subjects: ['Security'], regions: ['NE Region'] },
    sources: [],
    articles: []
  });

  const summary = getHealthSummary();

  assert.equal(summary.workspaceCount >= 1, true);
  assert.equal(summary.latestWorkspaceTitle, 'Health summary report');
  assert.equal(summary.latestWorkspaceStatus, 'draft');
});

test('saveWorkspace persists a draft and retrieves it by id', () => {
  const workspace = saveWorkspace({
    id: 'draft-123',
    title: 'Draft report',
    status: 'draft',
    parameters: { title: 'Draft report', startDate: '2026-06-01', endDate: '2026-06-18', classification: 'Public Draft', subjects: ['Security'], regions: ['NE Region'] },
    sources: [],
    articles: []
  });

  const reloaded = getWorkspaceById('draft-123');

  assert.equal(workspace.id, 'draft-123');
  assert.equal(reloaded?.title, 'Draft report');
  assert.equal(reloaded?.status, 'draft');
});

test('saveWorkspace preserves published workspaces with a publication timestamp', () => {
  const workspace = saveWorkspace({
    id: 'published-456',
    title: 'Published report',
    status: 'published',
    parameters: { title: 'Published report', startDate: '2026-06-01', endDate: '2026-06-18', classification: 'Public Draft', subjects: ['Security'], regions: ['NE Region'] },
    sources: [],
    articles: []
  });

  const reloaded = getWorkspaceById('published-456');

  assert.equal(workspace.status, 'published');
  assert.equal(reloaded?.status, 'published');
  assert.ok(reloaded?.publishedAt);
});
