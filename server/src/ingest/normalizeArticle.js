function stripHtml(value) {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeArticle(article) {
  if (!article || !article.url || !article.title) {
    return null;
  }

  const raw = stripHtml(article.rawText || '');

  return {
    title: (article.title || '').trim(),
    source: article.source || 'Unknown',
    url: article.url,
    date: article.date || new Date().toISOString().slice(0, 10),
    region: article.region || 'National Overview',
    subject: article.subject || 'Security',
    confidence: article.confidence || 'Medium',
    rawText: raw,
    excerpt: raw.slice(0, 400),
  };
}

module.exports = {
  normalizeArticle
};
