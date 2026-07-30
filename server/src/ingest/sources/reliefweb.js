/* eslint-disable @typescript-eslint/no-require-imports */
const https = require('https');

function fetchJson(url, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      },
      (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on('error', reject);
    request.write(JSON.stringify(body));
    request.end();
  });
}

async function searchReliefWeb({ startDate, endDate, subjects = [], regions = [] }) {
  const searchTerms = [
    'Nigeria',
    ...regions.filter((region) => region !== 'National Overview'),
    ...subjects
  ].filter(Boolean);

  const payload = {
    appname: 'northern-nigeria-situation-monitor',
    limit: 12,
    preset: 'latest',
    profile: 'list',
    query: {
      value: searchTerms.join(' '),
      operator: 'OR'
    },
    filter: {
      operator: 'AND',
      conditions: [
        {
          field: 'country.name',
          value: 'Nigeria'
        },
        {
          field: 'date.created',
          value: {
            from: startDate,
            to: endDate
          }
        }
      ]
    },
    fields: {
      include: ['title', 'url_alias', 'date.created', 'source.name', 'body']
    },
    sort: ['date.created:desc']
  };

  const response = await fetchJson(
    'https://api.reliefweb.int/v1/reports?appname=' + process.env.APPNAME,
    payload
  );

  const data = response.data || [];

  return data.map((report) => {
    const fields = report.fields || {};
    const title = fields.title || 'Untitled ReliefWeb report';
    const source = fields.source?.[0]?.name || 'ReliefWeb';
    const text = `${title} ${fields.body || ''}`;

    return {
      title,
      source,
      url: fields.url_alias || `https://reliefweb.int/report/${report.id}`,
      date: fields.date?.created?.slice(0, 10) || endDate,
      region: pickRegion(text, regions),
      subject: pickSubject(text, subjects),
      rawText: text
    };
  });
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
  searchReliefWeb
};
