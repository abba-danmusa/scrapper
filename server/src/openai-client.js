/* eslint-disable @typescript-eslint/no-var-requires */
const { OpenAI } = require('openai');

const validSections = [
  'Context Overview',
  'Regional Situation Overview',
  'Multisectoral Analysis',
  'Access Constraints',
  'Government and Humanitarian Response',
  'Outlook / Watchpoints'
];

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function keywordClassify(article) {
  const text = `${article.title || ''} ${article.extractedSummary || ''} ${article.subject || ''}`.toLowerCase();
  if (text.includes('access') || text.includes('inaccessible') || text.includes('curfew') || text.includes('movement')) {
    return 'Access Constraints';
  }

  if (text.includes('food') || text.includes('harvest') || text.includes('ipc') || text.includes('market') || text.includes('health') || text.includes('nutrition')) {
    return 'Multisectoral Analysis';
  }

  if (text.includes('government') || text.includes('evacuat') || text.includes('repatriat') || text.includes('policy') || text.includes('response')) {
    return 'Government and Humanitarian Response';
  }

  if (text.includes('outlook') || text.includes('watchpoint') || text.includes('watchpoints')) {
    return 'Outlook / Watchpoints';
  }

  return 'Context Overview';
}

async function classifyWithEmbeddings(article) {
  const client = getOpenAIClient();
  if (!client) {
    return keywordClassify(article);
  }

  const text = `${article.title || ''} ${article.extractedSummary || ''} ${article.subject || ''}`.trim();
  if (!text) {
    return 'Context Overview';
  }

  const sectionPrompts = validSections.map((section) => ({
    section,
    text: `Section: ${section}\nText: Classify whether the article belongs to this section.`
  }));

  const articleEmbeddingResp = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  const articleEmbedding = articleEmbeddingResp.data?.[0]?.embedding;
  if (!articleEmbedding) {
    return keywordClassify(article);
  }

  const sectionEmbeddingsResp = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: sectionPrompts.map((item) => item.text),
  });
  const sectionEmbeddings = sectionEmbeddingsResp.data?.map((entry) => entry.embedding).filter(Boolean);
  if (!sectionEmbeddings || sectionEmbeddings.length !== validSections.length) {
    return keywordClassify(article);
  }

  function dot(a, b) {
    return a.reduce((sum, v, idx) => sum + v * b[idx], 0);
  }

  function magnitude(vec) {
    return Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  }

  const articleMag = magnitude(articleEmbedding);
  let best = 'Context Overview';
  let bestScore = -Infinity;

  sectionEmbeddings.forEach((sectionEmbedding, idx) => {
    const score = dot(articleEmbedding, sectionEmbedding) / (articleMag * magnitude(sectionEmbedding));
    if (score > bestScore) {
      bestScore = score;
      best = validSections[idx];
    }
  });

  return best;
}

function summarizeFallback(article) {
  const sourceText = article.rawText || article.excerpt || article.extractedSummary || article.title || 'No summary available.';
  const normalized = sourceText.replace(/\s+/g, ' ').trim();
  const firstTwoSentences = normalized.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
  return firstTwoSentences || (normalized.endsWith('.') ? normalized : `${normalized}.`);
}

async function summarizeArticleWithLLM(article) {
  const client = getOpenAIClient();
  if (!client) {
    return summarizeFallback(article);
  }

  const articleText = (article.rawText || article.excerpt || article.extractedSummary || '').slice(0, 6000);
  const prompt = `You are editing an internal humanitarian situation report on northern Nigeria.

Rewrite the evidence below as one publish-ready analytical bullet of 35-65 words.

Rules:
- Lead with the event, change, or finding; do not lead with the article title.
- State the location and date only when supplied in the evidence.
- Preserve reported figures, attribution, uncertainty, and tense exactly.
- Explain direct humanitarian or operational significance only when supported by the evidence.
- Use restrained, neutral English. Avoid vague phrases such as "highlights concerns", "remains volatile", or "is relevant to".
- Do not invent causes, trends, comparisons, consequences, or affected groups.
- Do not add a heading, source label, citation, date prefix, region prefix, or commentary about the task.
- Return one paragraph only.

Metadata:
Title: ${article.title || 'Not supplied'}
Date: ${article.date || 'Not supplied'}
Region: ${article.region || 'Not supplied'}
Subject: ${article.subject || 'Not supplied'}
Source: ${article.source || 'Not supplied'}

Evidence:
${articleText || article.title || 'No evidence supplied'}`;

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
    max_output_tokens: 140,
  });

  const output = response.output?.[0]?.content?.[0]?.text?.trim();
  if (!output) {
    return summarizeFallback(article);
  }

  return output
    .replace(/^[-*•]\s*/, '')
    .replace(/\[(?:source|citation)[^\]]*\]\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  classifyWithEmbeddings,
  summarizeArticleWithLLM,
  summarizeFallback,
  keywordClassify,
};
