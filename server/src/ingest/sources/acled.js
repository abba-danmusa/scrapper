/* eslint-disable @typescript-eslint/no-require-imports */
const { fetchAcledResource } = require('./acled-oauth');

async function searchAcled({ startDate, endDate, regions = [], subjects = [] } = {}) {
  const params = {
    limit: 100,
  };

  if (startDate) params.date_from = startDate;
  if (endDate) params.date_to = endDate;

  try {
    const response = await fetchAcledResource(params);
    const results = (response.data || []).map((ev) => ({
      title: ev.notes || `${ev.event_type} in ${ev.admin1}`,
      source: 'ACLED',
      url: ev.source ? ev.source : '',
      date: ev.event_date || ev.iso_date || new Date().toISOString().slice(0, 10),
      region: pickRegionFromAdmin(ev.admin1, regions),
      subject: mapEventTypeToSubject(ev.event_type, subjects),
      rawText: `${ev.event_type} ${ev.notes || ''}`,
    }));

    return results;
  } catch (err) {
    console.warn('ACLED OAuth request failed', err && err.message ? err.message : err);
    return [];
  }
}

function pickRegionFromAdmin(admin1, requestedRegions) {
  if (!admin1) return requestedRegions[0] || 'National Overview';
  const normalized = admin1.toLowerCase();
  for (const region of requestedRegions) {
    if (region === 'National Overview') continue;
    if (normalized.includes(region.toLowerCase())) return region;
  }
  return requestedRegions[0] || 'National Overview';
}

function mapEventTypeToSubject(eventType, requestedSubjects) {
  const t = (eventType || '').toLowerCase();
  if (t.includes('violence') || t.includes('attack') || t.includes('abduction')) return 'Security';
  if (t.includes('infrastructure') || t.includes('explosion')) return 'Access Constraints';
  return requestedSubjects[0] || 'Security';
}

module.exports = {
  searchAcled,
};
