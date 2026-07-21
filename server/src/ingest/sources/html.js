const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

async function fetchPage(url, needsJs = false) {
  if (!needsJs) {
    const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scraper/1.0)' } });
    return res.data;
  }

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const content = await page.content();
    await page.close();
    return content;
  } finally {
    await browser.close();
  }
}

// A small set of site configs with selectors. Extend as needed.
const SITE_CONFIGS = [
  {
    name: 'TheCable',
    url: 'https://www.thecable.ng/',
    listSelector: 'article a',
    needsJs: false,
    article: { title: 'h1', body: 'article', date: 'time' }
  },
  {
    name: 'Premium Times',
    url: 'https://www.premiumtimesng.com/',
    listSelector: '.td-module-thumb a',
    needsJs: false,
    article: { title: 'h1', body: '.td-post-content', date: 'time' }
  }
];

async function searchHtmlSources({ subjects = [], regions = [], limitPerSite = 5 }) {
  const results = [];

  for (const site of SITE_CONFIGS) {
    try {
      const listHtml = await fetchPage(site.url, site.needsJs);
      const $ = cheerio.load(listHtml);
      const anchors = $(site.listSelector)
        .map((i, el) => $(el).attr('href'))
        .get()
        .filter(Boolean)
        .slice(0, limitPerSite);

      for (const href of anchors) {
        try {
          const abs = href.startsWith('http') ? href : new URL(href, site.url).href;
          const articleHtml = await fetchPage(abs, site.needsJs);
          const $$ = cheerio.load(articleHtml);
          const title = $$(site.article.title).first().text().trim() || 'Untitled Article';
          const body = $$(site.article.body).text().trim() || '';
          const date = $$(site.article.date).first().attr('datetime') || $$(site.article.date).first().text().slice(0, 10) || new Date().toISOString().slice(0, 10);
          const text = `${title} ${body}`;

          results.push({
            title,
            source: site.name,
            url: abs,
            date: date.slice(0, 10),
            region: pickRegion(text, regions),
            subject: pickSubject(text, subjects),
            rawText: text
          });
        } catch (err) {
          console.warn('Article fetch failed', site.name, err && err.message ? err.message : err);
        }
      }
    } catch (err) {
      console.warn('Site list fetch failed', site.url, err && err.message ? err.message : err);
    }
  }

  return results;
}

function pickRegion(text, requestedRegions) {
  const normalized = text.toLowerCase();
  const regionTerms = {
    'NE Region': ['borno', 'adamawa', 'yobe', 'northeast', 'north-east'],
    'NW Region': ['zamfara', 'katsina', 'sokoto', 'kebbi', 'kaduna', 'northwest', 'north-west'],
    'North Central': ['niger', 'plateau', 'benue', 'nasarawa', 'kogi', 'kwara', 'fct']
  };

  for (const region of requestedRegions) {
    if (region === 'National Overview') continue;
    const terms = regionTerms[region] || [region];
    if (terms.some((term) => normalized.includes(term))) return region;
  }

  return requestedRegions[0] || 'National Overview';
}

function pickSubject(text, requestedSubjects) {
  const normalized = text.toLowerCase();
  const subjectKeywords = [
    { subject: 'Food Security', terms: ['food security', 'hunger', 'famine', 'ipc'] },
    { subject: 'Nutrition', terms: ['nutrition', 'malnutrition', 'sam', 'mam'] },
    { subject: 'Health', terms: ['health', 'cholera', 'outbreak', 'disease', 'clinic'] },
    { subject: 'WASH', terms: ['wash', 'water', 'sanitation', 'hygiene'] },
    { subject: 'Security', terms: ['attack', 'abduction', 'kidnap', 'armed', 'conflict'] },
    { subject: 'Education', terms: ['school', 'education', 'learning'] },
    { subject: 'Shelter / NFI', terms: ['shelter', 'nfi', 'household items'] },
    { subject: 'Humanitarian Response', terms: ['humanitarian', 'response', 'assistance'] },
    { subject: 'Government Response', terms: ['government', 'authority', 'ministry'] }
  ];

  for (const candidate of subjectKeywords) {
    if (
      requestedSubjects.includes(candidate.subject) &&
      candidate.terms.some((term) => normalized.includes(term))
    ) {
      return candidate.subject;
    }
  }

  return requestedSubjects[0] || 'Security';
}

module.exports = {
  searchHtmlSources
};
