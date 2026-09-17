const REGION_TERMS = {
  'NE Region': ['borno', 'adamawa', 'yobe', 'maiduguri', 'mandara', 'gwoza', 'monguno', 'damaturu', 'mubi', 'northeast', 'north-east', 'north east'],
  'NW Region': ['zamfara', 'katsina', 'sokoto', 'kebbi', 'kaduna', 'kano', 'jigawa', 'gusau', 'maradun', 'birnin', 'northwest', 'north-west', 'north west'],
  'North Central': ['niger', 'plateau', 'benue', 'nasarawa', 'kogi', 'kwara', 'fct', 'abuja', 'jos', 'makurdi', 'minna', 'lafia', 'north central'],
  Borno: ['borno', 'maiduguri', 'gwoza', 'monguno', 'mandara'],
  Adamawa: ['adamawa', 'mubi', 'yola'],
  Yobe: ['yobe', 'damaturu'],
  Zamfara: ['zamfara', 'gusau', 'maradun'],
  Katsina: ['katsina'],
  Sokoto: ['sokoto'],
  Kaduna: ['kaduna'],
  Kebbi: ['kebbi', 'birnin kebbi'],
  Kano: ['kano'],
  Jigawa: ['jigawa'],
};

const SUBJECT_TERMS = {
  Economy: ['economy', 'inflation', 'market', 'prices', 'currency', 'trade', 'livelihood', 'fuel', 'naira'],
  Security: ['attack', 'attacks', 'abduction', 'kidnap', 'kidnapping', 'armed', 'bandit', 'insurgent', 'boko haram', 'iswap', 'conflict', 'violence', 'killed', 'fatality', 'military', 'security'],
  Nutrition: ['nutrition', 'malnutrition', 'sam', 'mam', 'wasting', 'stunting'],
  Health: ['health', 'cholera', 'outbreak', 'disease', 'clinic', 'hospital', 'vaccination', 'measles'],
  'Food Security': ['food security', 'hunger', 'famine', 'ipc', 'lean season', 'food assistance', 'food insecurity'],
  WASH: ['wash', 'water', 'sanitation', 'hygiene', 'latrine'],
  'Government Response': ['government', 'authority', 'ministry', 'lawmakers', 'police', 'security forces', 'agency'],
  'Humanitarian Response': ['humanitarian', 'response', 'assistance', 'relief', 'partners', 'aid', 'unicef', 'wfp', 'ocha', 'unhcr'],
  Education: ['school', 'education', 'learning', 'teacher', 'students'],
  'Shelter / NFI': ['shelter', 'nfi', 'non-food', 'household items', 'displacement camp'],
  'Access Constraints': ['access', 'road', 'route', 'checkpoint', 'movement', 'constraint', 'restriction'],
};

const NIGERIA_TERMS = [
  'nigeria',
  'nigerian',
  'borno',
  'adamawa',
  'yobe',
  'zamfara',
  'katsina',
  'sokoto',
  'kebbi',
  'kaduna',
  'kano',
  'jigawa',
  'niger state',
  'plateau',
  'benue',
  'nasarawa',
  'kogi',
  'kwara',
  'abuja',
];

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function getArticleText(article) {
  return normalizeText([
    article.title,
    article.rawText,
    article.excerpt,
    article.summary,
    ...(Array.isArray(article.extractedFacts) ? article.extractedFacts : []),
  ].join(' '));
}

function getRegionMatch(article, selectedRegions, text) {
  if (selectedRegions.includes('National Overview') && includesAny(text, NIGERIA_TERMS)) {
    return {
      region: article.region && article.region !== 'National Overview' ? article.region : 'National Overview',
      matched: true,
      reason: 'Nigeria/national term matched',
    };
  }

  for (const region of selectedRegions) {
    if (region === 'National Overview') continue;
    const terms = REGION_TERMS[region] || [region.toLowerCase()];
    if (includesAny(text, terms)) {
      return { region, matched: true, reason: `${region} term matched` };
    }
  }

  return {
    region: article.region || 'National Overview',
    matched: selectedRegions.length === 0,
    reason: selectedRegions.length === 0 ? 'No region filter selected' : 'No selected-region evidence',
  };
}

function getSubjectMatch(article, selectedSubjects, text) {
  for (const subject of selectedSubjects) {
    const terms = SUBJECT_TERMS[subject] || [subject.toLowerCase()];
    if (includesAny(text, terms)) {
      return { subject, matched: true, reason: `${subject} term matched` };
    }
  }

  if (selectedSubjects.length === 0) {
    return { subject: article.subject || 'Security', matched: true, reason: 'No subject filter selected' };
  }

  return {
    subject: article.subject || selectedSubjects[0],
    matched: false,
    reason: 'No selected-subject evidence',
  };
}

function scoreSingleArticle(article, filters = {}) {
  const selectedSubjects = Array.isArray(filters.subjects) ? filters.subjects.filter(Boolean) : [];
  const selectedRegions = Array.isArray(filters.regions) ? filters.regions.filter(Boolean) : [];
  const text = getArticleText(article);
  const regionMatch = getRegionMatch(article, selectedRegions, text);
  const subjectMatch = getSubjectMatch(article, selectedSubjects, text);
  const hasNigeriaEvidence = includesAny(text, NIGERIA_TERMS);
  const labelRegionMatch = selectedRegions.includes(article.region) || selectedRegions.length === 0;
  const labelSubjectMatch = selectedSubjects.includes(article.subject) || selectedSubjects.length === 0;

  let score = 0;
  if (regionMatch.matched) score += 2;
  if (subjectMatch.matched) score += 2;
  if (hasNigeriaEvidence) score += 1;
  if (labelRegionMatch && regionMatch.matched) score += 1;
  if (labelSubjectMatch && subjectMatch.matched) score += 1;

  const isRelevant =
    subjectMatch.matched &&
    (regionMatch.matched || selectedRegions.includes('National Overview') || selectedRegions.length === 0) &&
    score >= 4;

  return {
    ...article,
    region: regionMatch.matched ? regionMatch.region : article.region,
    subject: subjectMatch.matched ? subjectMatch.subject : article.subject,
    relevanceScore: score,
    relevanceReasons: [regionMatch.reason, subjectMatch.reason, hasNigeriaEvidence ? 'Nigeria evidence matched' : 'No Nigeria evidence'],
    isRelevant,
    confidence: isRelevant && score >= 5 ? 'High' : isRelevant ? article.confidence || 'Medium' : 'Low',
  };
}

function scoreArticles(articles, filters = {}) {
  return articles
    .map((article) => scoreSingleArticle(article, filters))
    .filter((article) => article.isRelevant)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

module.exports = {
  scoreArticles,
  scoreSingleArticle,
  REGION_TERMS,
  SUBJECT_TERMS,
};
