const { normalizeArticle } = require('./normalizeArticle');
const { dedupeArticles } = require('./dedupeArticles');
const { scoreArticles } = require('./scoreArticles');
const { searchReliefWeb } = require('./sources/reliefweb');
const { searchRss } = require('./sources/rss');
const { searchAcled } = require('./sources/acled');
const { searchHtmlSources } = require('./sources/html');
const { persistArticles } = require('./store');

async function ingestPipeline(payload = {}) {
  const {
    startDate,
    endDate,
    subjects = [],
    regions = [],
    enabledSources = ['ReliefWeb', 'RSS']
  } = payload;

  const sourceResults = [];

  if (enabledSources.includes('ReliefWeb')) {
    const reliefWebResults = await searchReliefWeb({
      startDate,
      endDate,
      subjects,
      regions
    });

    sourceResults.push(...reliefWebResults);
  }

  if (enabledSources.includes('RSS')) {
    const rssResults = await searchRss({
      subjects,
      regions
    });

    sourceResults.push(...rssResults);
  }

  if (enabledSources.includes('HTML')) {
    const htmlResults = await searchHtmlSources({ subjects, regions });
    sourceResults.push(...htmlResults);
  }

  if (enabledSources.includes('ACLED')) {
    const acledResults = await searchAcled({ startDate, endDate, regions, subjects });
    sourceResults.push(...acledResults);
  }

  const normalized = sourceResults
    .map((article) => normalizeArticle(article))
    .filter(Boolean);

  const deduped = dedupeArticles(normalized);
  const scored = scoreArticles(deduped, { subjects, regions });

  // Persist a snapshot of the ingested articles for downstream tools
  try {
    persistArticles(scored);
  } catch (err) {
    console.warn('Failed to persist articles snapshot', err && err.message ? err.message : err);
  }

  return {
    ok: true,
    count: scored.length,
    articles: scored
  };
}

module.exports = {
  ingestPipeline
};
