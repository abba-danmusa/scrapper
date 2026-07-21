const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

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
      } catch (err) {
        // ignore proxy parsing error
      }
    }

    const res = await axios.get(robotsUrl, axiosConfig);
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
  } catch (err) {
    console.info(`Could not fetch robots.txt for ${domainUrl}: ${err.message}. Assuming all paths allowed.`);
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
  } catch (err) {
    console.warn(`Error checking robots.txt compliance for ${targetUrl}:`, err.message);
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
      } catch (err) {
        // ignore proxy parsing error
      }
    }
    const res = await axios.get(url, axiosConfig);
    return res.data;
  }

  const browserOptions = {
    args: ['--no-sandbox']
  };
  if (process.env.SCRAPER_PROXY) {
    browserOptions.proxy = {
      server: process.env.SCRAPER_PROXY
    };
  }

  const browser = await chromium.launch(browserOptions);
  try {
    const page = await browser.newPage({
      userAgent: userAgent
    });
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
      if (!listHtml) continue;
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
          if (!articleHtml) continue;
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
  searchHtmlSources,
  getRandomUserAgent,
  isUrlAllowedByRobotsTxt,
  robotsCache
};
