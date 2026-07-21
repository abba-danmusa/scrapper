const Parser = require('rss-parser');

async function searchRss({ subjects = [], regions = [] }) {
  const parser = new Parser({
    customFields: {
      item: ['content:encoded', 'media:content']
    }
  });

  const feedSources = [
    // Nigerian outlets
    { url: 'https://www.dailytrust.com.ng/feed/', name: 'Daily Trust' },
    { url: 'https://humanglemedia.com/feed/', name: 'HumAngle' },
    { url: 'https://www.premiumtimesng.com/feed/', name: 'Premium Times' },
    { url: 'https://www.thecable.ng/feed', name: 'TheCable' },
    { url: 'https://punchng.com/feed/', name: 'Punch' },
    { url: 'https://www.vanguardngr.com/feed/', name: 'Vanguard' },

    // Regional / international
    { url: 'http://feeds.bbci.co.uk/news/world/africa/rss.xml', name: 'BBC Africa' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' },
    { url: 'https://www.reuters.com/rssFeed/africaNews', name: 'Reuters Africa' },
    { url: 'https://www.unicef.org/rss/en/news.xml', name: 'UNICEF' },
    { url: 'https://www.who.int/rss-feeds/news-english.xml', name: 'WHO' }
  ];

  const allItems = [];

  for (const feedSource of feedSources) {
    try {
      const feed = await parser.parseURL(feedSource.url);
      const items = (feed.items || []).map((item) => {
        const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''}`;
        const region = pickRegion(text, regions);
        const subject = pickSubject(text, subjects);

        return {
          title: item.title || 'Untitled RSS item',
          source: feed.title || feedSource.name || 'RSS Source',
          url: item.link || '',
          date: item.pubDate ? item.pubDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
          region,
          subject,
          rawText: text
        };
      });

      allItems.push(...items);
    } catch (error) {
      console.warn(`RSS feed failed: ${feedSource.url} (${feedSource.name})`, error && error.message ? error.message : error);
    }
  }

  return allItems;
}

function pickRegion(text, requestedRegions) {
  const normalized = text.toLowerCase();
  const regionTerms = {
    'NE Region': ['borno', 'adamawa', 'yobe', 'northeast', 'north-east'],
    'NW Region': ['zamfara', 'katsina', 'sokoto', 'kebbi', 'kaduna', 'northwest', 'north-west'],
    'North Central': ['niger', 'plateau', 'benue', 'nasarawa', 'kogi', 'kwara', 'fct']
  };

  for (const region of requestedRegions) {
    if (region === 'National Overview') {
      continue;
    }

    const terms = regionTerms[region] || [region];
    if (terms.some((term) => normalized.includes(term))) {
      return region;
    }
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
  searchRss
};
