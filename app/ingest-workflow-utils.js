function buildQueuedArticleFromIngested(article, id) {
  return {
    id,
    title: article.title,
    source: article.source,
    url: article.url,
    date: article.date,
    region: article.region,
    subject: article.subject,
    confidence: article.confidence ?? 'High',
    status: 'Queued',
    extractedSummary: article.summary ?? null,
    extractedFacts: article.extractedFacts ?? [],
  };
}

module.exports = {
  buildQueuedArticleFromIngested,
};
