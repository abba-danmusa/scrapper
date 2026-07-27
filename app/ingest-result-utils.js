function formatIngestResultMessage(payload, incomingArticles, newArticleCount = incomingArticles.length, duplicateCount = 0) {
  const returnedCount = payload.count ?? incomingArticles.length;
  const actualNewCount = newArticleCount ?? Math.max(0, returnedCount);
  const duplicatesSkipped = duplicateCount ?? Math.max(0, returnedCount - actualNewCount);

  if (actualNewCount > 0) {
    return `${actualNewCount} new item${actualNewCount === 1 ? "" : "s"} added from the ingestion pipeline.${duplicatesSkipped > 0 ? ` ${duplicatesSkipped} duplicate${duplicatesSkipped === 1 ? "" : "s"} were skipped.` : " Duplicate URLs were skipped."}`;
  }

  if (payload.lastErrors && payload.lastErrors.length > 0) {
    const failureSummary = payload.lastErrors
      .slice(0, 3)
      .map((entry) => `${entry.source}: ${entry.message}`)
      .join(" • ");

    return `No new articles were returned. The pipeline reported ${payload.lastErrors.length} source issue${payload.lastErrors.length === 1 ? "" : "s"}: ${failureSummary}`;
  }

  if (payload.sourceHealth && payload.sourceHealth.some((entry) => !entry.ok)) {
    return "No new articles were returned. One or more sources reported errors.";
  }

  if (returnedCount > 0) {
    if (duplicatesSkipped > 0) {
      return `The pipeline returned ${returnedCount} article${returnedCount === 1 ? "" : "s"}, but ${duplicatesSkipped} ${duplicatesSkipped === 1 ? "was" : "were"} already present in the workspace and were skipped.`;
    }

    return `The pipeline returned ${returnedCount} article${returnedCount === 1 ? "" : "s"}, but none were added to the workspace.`;
  }

  return "No new articles were returned by the ingestion pipeline.";
}

module.exports = {
  formatIngestResultMessage,
};
