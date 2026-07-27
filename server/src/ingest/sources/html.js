/* eslint-disable @typescript-eslint/no-require-imports */
const axios = require('axios');
const cheerio = require('cheerio');

let chromium = null;
try {
  ({ chromium } = require('playwright'));
} catch (err) {
  console.warn(
    'Playwright is not installed or could not be loaded. Browser rendering fallback will be disabled.',
    err && err.message ? err.message : err,
  );
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildDefaultHeaders(userAgent) {
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache'
  };
}

const robotsCache = new Map();

async function getRobotsRules(domainUrl) {
  if (robotsCache.has(domainUrl)) {
    return robotsCache.get(domainUrl);
  }

  const rules = {
    disallowedPaths: [],
    allowedPaths: []
  };

  try {
    const robotsUrl = `${domainUrl}/robots.txt`;
    const userAgent = getRandomUserAgent();
    const axiosConfig = {
      timeout: 5000,
      headers: { 'User-Agent': userAgent }
    };
    if (process.env.SCRAPER_PROXY) {
      try {
        const proxyUrl = new URL(process.env.SCRAPER_PROXY);
        axiosConfig.proxy = {
          protocol: proxyUrl.protocol.replace(':', ''),
          host: proxyUrl.hostname,
          port: parseInt(proxyUrl.port, 10)
        };
        if (proxyUrl.username || proxyUrl.password) {
          axiosConfig.proxy.auth = {
            username: decodeURIComponent(proxyUrl.username),
            password: decodeURIComponent(proxyUrl.password)
          };
        }
      } catch {
        // ignore proxy parsing error
      }
    }

    // Try a couple of times for flaky networks
    let res = null;
    try {
      res = await axios.get(robotsUrl, axiosConfig);
    } catch {
      try {
        await new Promise((r) => setTimeout(r, 500));
        res = await axios.get(robotsUrl, axiosConfig);
      } catch (error) {
        throw error;
      }
    }
    const content = res.data;

    if (typeof content === 'string') {
      const lines = content.split(/\r?\n/);
      let currentUserAgentMatches = false;

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine || cleanLine.startsWith('#')) continue;

        const separatorIndex = cleanLine.indexOf(':');
        if (separatorIndex === -1) continue;

        const key = cleanLine.slice(0, separatorIndex).trim().toLowerCase();
        const val = cleanLine.slice(separatorIndex + 1).trim();

        if (key === 'user-agent') {
          currentUserAgentMatches = (val === '*');
        } else if (currentUserAgentMatches) {
          if (key === 'disallow') {
            if (val) {
              rules.disallowedPaths.push(val);
            }
          } else if (key === 'allow') {
            if (val) {
              rules.allowedPaths.push(val);
            }
          }
        }
      }
    }
} catch (error) {
      console.info(`Could not fetch robots.txt for ${domainUrl}: ${error.message}. Assuming all paths allowed.`);
  }

  robotsCache.set(domainUrl, rules);
  return rules;
}

async function isUrlAllowedByRobotsTxt(targetUrl) {
  try {
    const urlObj = new URL(targetUrl);
    const domainUrl = `${urlObj.protocol}//${urlObj.host}`;
    const path = urlObj.pathname + urlObj.search;

    const rules = await getRobotsRules(domainUrl);

    // If there is an explicit allow, allow it
    const isExplicitlyAllowed = rules.allowedPaths.some((allowedPath) => {
      const prefix = allowedPath.replace(/\*/g, '.*');
      const regex = new RegExp('^' + prefix);
      return regex.test(path);
    });

    if (isExplicitlyAllowed) return true;

    // Check disallows
    const isDisallowed = rules.disallowedPaths.some((disallowedPath) => {
      const prefix = disallowedPath.replace(/\*/g, '.*');
      const regex = new RegExp('^' + prefix);
      return regex.test(path);
    });

    return !isDisallowed;
  } catch (error) {
    console.warn(`Error checking robots.txt compliance for ${targetUrl}:`, error.message);
    return true; // Default to allow on error
  }
}

async function fetchPage(url, needsJs = false) {
  const allowed = await isUrlAllowedByRobotsTxt(url);
  if (!allowed) {
    console.info(`Access to ${url} is disallowed by robots.txt`);
    return null;
  }

  const userAgent = getRandomUserAgent();

  if (!needsJs) {
    const axiosConfig = {
      timeout: 15000,
      headers: buildDefaultHeaders(userAgent)
    };
    if (process.env.SCRAPER_PROXY) {
      try {
        const proxyUrl = new URL(process.env.SCRAPER_PROXY);
        axiosConfig.proxy = {
          protocol: proxyUrl.protocol.replace(':', ''),
          host: proxyUrl.hostname,
          port: parseInt(proxyUrl.port, 10)
        };
        if (proxyUrl.username || proxyUrl.password) {
          axiosConfig.proxy.auth = {
            username: decodeURIComponent(proxyUrl.username),
            password: decodeURIComponent(proxyUrl.password)
          };
        }
      } catch {
        // ignore proxy parsing error
      }
    }

    try {
      let response = null;
      try {
        response = await axios.get(url, axiosConfig);
      } catch {
        // brief backoff then retry once
        await new Promise((r) => setTimeout(r, 700));
        response = await axios.get(url, axiosConfig);
      }
      return response.data;
    } catch (error) {
      console.warn(`HTTP request failed for ${url}, falling back to browser render:`, error && error.message ? error.message : error);
    }
  }

  const browserOptions = {
    args: ['--no-sandbox']
  };
  if (process.env.SCRAPER_PROXY) {
    browserOptions.proxy = {
      server: process.env.SCRAPER_PROXY
    };
  }

  if (!chromium) {
    console.info(`Playwright is unavailable; skipping browser render for ${url}.`);
    return null;
  }

  let browser;
  try {
    browser = await chromium.launch(browserOptions);
    const page = await browser.newPage({
      userAgent: userAgent,
      extraHTTPHeaders: buildDefaultHeaders(userAgent)
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    const content = await page.content();
    await page.close();
    return content;
  } catch (error) {
    console.warn(`Browser render failed for ${url}:`, error && error.message ? error.message : error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function cleanArticleNode($node) {
  const selectors = [
    'script',
    'style',
    'noscript',
    'iframe',
    'ins.adsbygoogle',
    '.adsbygoogle',
    '.article-share-bottom',
    '.sharethis-inline-share-buttons',
    '.share-buttons',
    '.social-share',
    '.related-posts',
    '.related-articles',
    '.comments',
    '.comment',
    '.newsletter',
    '.ads',
    '.advertisement',
    '.advert',
    '.post-meta',
    '.meta',
    '.date',
    '.byline'
  ];

  selectors.forEach((selector) => {
    $node.find(selector).remove();
  });
}

function normalizeDateString(value) {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();

  const isoMatch = cleaned.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const ymdMatch = cleaned.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  }

  const monthMap = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12'
  };

  const longDateMatch = cleaned.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i);
  if (longDateMatch) {
    const month = monthMap[longDateMatch[1].toLowerCase()];
    const day = longDateMatch[2].padStart(2, '0');
    return `${longDateMatch[3]}-${month}-${day}`;
  }

  const shortDateMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (shortDateMatch) {
    const month = shortDateMatch[1].padStart(2, '0');
    const day = shortDateMatch[2].padStart(2, '0');
    return `${shortDateMatch[3]}-${month}-${day}`;
  }

  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function extractArticleDate($$, html, selector) {
  if (selector) {
    const dateElement = $$(selector).first();
    if (dateElement.length) {
      const rawDate = dateElement.attr('datetime') || dateElement.attr('content') || dateElement.text();
      const normalized = normalizeDateString(rawDate);
      if (normalized) return normalized;
    }
  }

  const jsonLdText = $$('script[type="application/ld+json"]').text();
  const jsonLdMatch = jsonLdText.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (jsonLdMatch) {
    const normalized = normalizeDateString(jsonLdMatch[1]);
    if (normalized) return normalized;
  }

  const found = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}/i);
  if (found) {
    const normalized = normalizeDateString(found[0]);
    if (normalized) return normalized;
  }

  const fallbackMatch = html.match(/(\d{4}-\d{2}-\d{2})/);
  if (fallbackMatch) {
    return fallbackMatch[1];
  }

  return null;
}

function isValidAnchorHref(href, site) {
  if (!href || typeof href !== 'string') return false;
  const trimmed = href.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('javascript:')) return false;
  if (site.hrefPattern instanceof RegExp) {
    return site.hrefPattern.test(trimmed);
  }
  if (typeof site.hrefPattern === 'function') {
    return site.hrefPattern(trimmed);
  }
  return true;
}

// A small set of site configs with selectors. Extend as needed.
const SITE_CONFIGS = [
  {
    name: 'TheCable',
    url: 'https://www.thecable.ng/',
    listSelector: 'article a',
    needsJs: false,
    cleanupSelectors: ['.article-share-bottom', '.sharethis-inline-share-buttons', '.adasprso-inline-container', '.cs-posts-area__read-next', '.tdb-block-text', '.adsbygoogle'],
    article: { title: 'h1', body: '.entry-content', date: 'meta[property="article:published_time"]' }
  },
  {
    name: 'Premium Times',
    url: 'https://www.premiumtimesng.com/',
    listSelector: '.td-module-thumb a',
    needsJs: false,
    cleanupSelectors: ['.td-post-sharing', '.related-posts', '.td-ps-share', '.adsbygoogle'],
    article: { title: 'h1', body: '.td-post-content', date: 'time' }
  },
  {
    name: 'HumAngle',
    url: 'https://humanglemedia.com/',
    listSelector: '.post-title a',
    needsJs: false,
    cleanupSelectors: ['.adasprso-inline-container', '.article-share-bottom', '.sharethis-inline-share-buttons', '.support', '.wp-block-group'],
    article: { title: 'h1', body: '.entry-content', date: 'meta[property="article:published_time"]' }
  },
  {
    name: 'Daily Trust',
    url: 'https://dailytrust.com/',
    listSelector: '.list_card a',
    needsJs: false,
    cleanupSelectors: ['.related-posts', '.share-buttons', '.adsbygoogle', '.td-module-meta-info'],
    hrefPattern: /^\/\d{4}-[^\s]+|^\/[^\s]+-\d{4}/,
    article: { title: 'h1', body: '.body.article__body', date: 'script[type="application/ld+json"]' }
  },
  {
    name: 'SaharaReporters',
    url: 'https://saharareporters.com/',
    listSelector: '.node--type-article a',
    needsJs: false,
    cleanupSelectors: ['.article-share-bottom', '.sharethis-inline-share-buttons', '.adsbygoogle', '.related-posts', '.related-articles'],
    hrefPattern: /^(?:\/\d{4}\/\d{2}\/\d{2}\/[^\s]+|\/articles\?f%5B0%5D=article_type%3A\d+)/,
    article: { title: 'h1', body: '.content.lead', date: 'script[type="application/ld+json"]' }
  }
];

async function searchHtmlSources({ subjects = [], regions = [], limitPerSite = 5 }) {
  const results = [];

  for (const site of SITE_CONFIGS) {
    try {
      const listHtml = await fetchPage(site.url, site.needsJs);
      if (!listHtml) continue;
      const $ = cheerio.load(listHtml);
      const anchors = Array.from(
        new Set(
          $(site.listSelector)
            .map((i, el) => $(el).attr('href'))
            .get()
            .filter(Boolean)
            .filter((href) => isValidAnchorHref(href, site))
        )
      ).slice(0, limitPerSite);

      for (const href of anchors) {
        try {
          const abs = href.startsWith('http') ? href : new URL(href, site.url).href;
          const articleHtml = await fetchPage(abs, site.needsJs);
          if (!articleHtml) continue;
          const $$ = cheerio.load(articleHtml);
          const title = $$(site.article.title).first().text().trim() || 'Untitled Article';
          const bodyElement = $$(site.article.body).first();
          if (site.cleanupSelectors && bodyElement.length) {
            site.cleanupSelectors.forEach((selector) => bodyElement.find(selector).remove());
          }
          if (bodyElement.length) {
            cleanArticleNode(bodyElement);
          }
          const body = bodyElement.text().trim() || '';
          const date = extractArticleDate($$, articleHtml, site.article.date) || new Date().toISOString().slice(0, 10);
          const text = `${title} ${body}`.replace(/\s+/g, ' ').trim();

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
  searchHtmlSources,
  getRandomUserAgent,
  isUrlAllowedByRobotsTxt,
  robotsCache
};
