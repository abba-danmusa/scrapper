/* eslint-disable @typescript-eslint/no-var-requires */
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyWithEmbeddings, summarizeArticleWithLLM, summarizeFallback } = require('../src/openai-client');

const backupApiKey = process.env.OPENAI_API_KEY;

test('OpenAI client helpers return fallback values when API key is missing', async () => {
  delete process.env.OPENAI_API_KEY;

  const classification = await classifyWithEmbeddings({ title: 'Test', subject: 'Health', extractedSummary: 'A short summary' });
  assert.equal(typeof classification, 'string');
  assert.ok(classification.length > 0);

  const summary = await summarizeArticleWithLLM({ title: 'Test title', rawText: 'Test raw text' });
  assert.equal(typeof summary, 'string');
  assert.ok(summary.includes('Test title') || summary.includes('Test raw text'));
});

process.env.OPENAI_API_KEY = backupApiKey;

test('summary fallback uses source evidence without adding metadata boilerplate', () => {
  const summary = summarizeFallback({
    title: 'Cholera response expands in Borno',
    rawText: 'Health teams opened two treatment centres in Maiduguri. WHO reported 42 suspected cases.',
    date: '2026-06-17',
    region: 'NE Region',
  });

  assert.equal(summary, 'Health teams opened two treatment centres in Maiduguri. WHO reported 42 suspected cases.');
  assert.equal(summary.includes('NE Region:'), false);
  assert.equal(summary.includes('2026-06-17'), false);
});
