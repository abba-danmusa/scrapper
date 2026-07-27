/* eslint-disable @typescript-eslint/no-require-imports */
const { normalizeArticle } = require('./normalizeArticle');
const { dedupeArticles } = require('./dedupeArticles');
const { scoreArticles } = require('./scoreArticles');
const { searchReliefWeb } = require('./sources/reliefweb');
const { searchRss } = require('./sources/rss');
const { searchAcled } = require('./sources/acled');
const { searchHtmlSources } = require('./sources/html');
const { persistArticles } = require('./store');

function extractFacts(article) {
  const rawText = article.rawText || '';
  const title = article.title || '';
  const facts = [];

  if (title) {
    facts.push(`Headline: ${title}`);
  }

  if (article.source) {
    facts.push(`Source: ${article.source}`);
  }

  if (article.region) {
    facts.push(`Region: ${article.region}`);
  }

  if (article.subject) {
    facts.push(`Subject: ${article.subject}`);
  }

  if (rawText) {
    const firstSentence = rawText.split(/(?<=[.!?])\s+/).find(Boolean) || rawText.slice(0, 220);
    facts.push(`Context: ${firstSentence.slice(0, 220)}`);
  }

  return facts.slice(0, 4);
}

function enrichArticle(article) {
  const normalized = article;
  const text = normalized.rawText || normalized.excerpt || normalized.title || '';
  const summary = text
    ? `${normalized.title || 'Article'} summarizes a ${normalized.subject || 'security'} development in ${normalized.region || 'the region'} with relevant reporting from ${normalized.source || 'the source network'}.`
    : `${normalized.title || 'Article'} was ingested from ${normalized.source || 'the source network'}.`;

  return {
    ...normalized,
    summary,
    extractedFacts: extractFacts(normalized),
    confidence: normalized.confidence || 'Medium',
  };
}

async function runSource(sourceName, sourceRunner, args = {}) {
  try {
    const results = await sourceRunner(args);
    return { articles: Array.isArray(results) ? results : [], error: null };
  } catch (err) {
    const message = err && err.message ? err.message : 'Unknown source error';
    console.warn(`Source ${sourceName} failed:`, message);
    return { articles: [], error: message };
  }
}

async function ingestPipeline(payload = {}) {
  const {
    startDate,
    endDate,
    subjects = [],
    regions = [],
    enabledSources = ['ReliefWeb', 'RSS'],
    sourceFunctions = {}
  } = payload;

  const sourceResults = [];
  const sourceHealth = [];
  const lastErrors = [];
  const reliefWebRunner = sourceFunctions.searchReliefWeb || searchReliefWeb;
  const rssRunner = sourceFunctions.searchRss || searchRss;
  const htmlRunner = sourceFunctions.searchHtmlSources || searchHtmlSources;
  const acledRunner = sourceFunctions.searchAcled || searchAcled;

  if (enabledSources.includes('ReliefWeb')) {
    const reliefWebResults = await runSource('ReliefWeb', reliefWebRunner, {
      startDate,
      endDate,
      subjects,
      regions
    });

    sourceResults.push(...reliefWebResults.articles);
    sourceHealth.push({
      name: 'ReliefWeb',
      ok: !reliefWebResults.error,
      count: reliefWebResults.articles.length,
      error: reliefWebResults.error,
      checkedAt: new Date().toISOString(),
    });
    if (reliefWebResults.error) {
      lastErrors.push({ source: 'ReliefWeb', message: reliefWebResults.error });
    }
  }

  if (enabledSources.includes('RSS')) {
    const rssResults = await runSource('RSS', rssRunner, {
      subjects,
      regions
    });

    sourceResults.push(...rssResults.articles);
    sourceHealth.push({
      name: 'RSS',
      ok: !rssResults.error,
      count: rssResults.articles.length,
      error: rssResults.error,
      checkedAt: new Date().toISOString(),
    });
    if (rssResults.error) {
      lastErrors.push({ source: 'RSS', message: rssResults.error });
    }
  }

  if (enabledSources.includes('HTML')) {
    const htmlResults = await runSource('HTML', htmlRunner, { subjects, regions });
    sourceResults.push(...htmlResults.articles);
    sourceHealth.push({
      name: 'HTML',
      ok: !htmlResults.error,
      count: htmlResults.articles.length,
      error: htmlResults.error,
      checkedAt: new Date().toISOString(),
    });
    if (htmlResults.error) {
      lastErrors.push({ source: 'HTML', message: htmlResults.error });
    }
  }

  if (enabledSources.includes('ACLED')) {
    const acledResults = await runSource('ACLED', acledRunner, { startDate, endDate, regions, subjects });
    sourceResults.push(...acledResults.articles);
    sourceHealth.push({
      name: 'ACLED',
      ok: !acledResults.error,
      count: acledResults.articles.length,
      error: acledResults.error,
      checkedAt: new Date().toISOString(),
    });
    if (acledResults.error) {
      lastErrors.push({ source: 'ACLED', message: acledResults.error });
    }
  }

  const normalized = sourceResults
    .map((article) => normalizeArticle(article))
    .filter(Boolean);

  const deduped = dedupeArticles(normalized);
  const scored = scoreArticles(deduped, { subjects, regions }).map((article) => enrichArticle(article));

  // Persist a snapshot of the ingested articles for downstream tools
  try {
    await persistArticles(scored, {
      sourceHealth: sourceHealth.slice(0, 10),
      lastErrors: lastErrors.slice(-5),
    });
  } catch (err) {
    console.warn('Failed to persist articles snapshot', err && err.message ? err.message : err);
  }

  return {
    ok: true,
    count: scored.length,
    articles: scored,
    sourceHealth,
    lastErrors,
  };
}

module.exports = {
  ingestPipeline
};
