'use strict';

// ─── Tokenize text into sentences ─────────────────────────────
// Czech-aware: splits on . ! ? followed by space+uppercase or end
function tokenizeSentences(text) {
  const raw = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?…])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/);
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && s.split(/\s+/).length > 2);
}

// ─── Tokenize into words ───────────────────────────────────────
function tokenizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-záčďéěíňóřšťúůýžA-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && /[a-záčďéě]/.test(w));
}

// ─── Analyze single article ────────────────────────────────────
function analyzeArticle(article) {
  const text = article.text;

  const sentences = tokenizeSentences(text);
  const words = tokenizeWords(text);

  if (sentences.length === 0 || words.length === 0) return null;

  // Average sentence length (in words)
  const sentenceLengths = sentences.map((s) => tokenizeWords(s).length);
  const avgSentenceLength =
    sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;

  // Average word length (in characters)
  const avgWordLength =
    words.reduce((sum, w) => sum + w.length, 0) / words.length;

  // Long word ratio: words with 6+ characters
  const longWords = words.filter((w) => w.length >= 6);
  const longWordRatio = longWords.length / words.length;

  // Unique word ratio (type-token ratio)
  const uniqueWords = new Set(words);
  const uniqueWordRatio = uniqueWords.size / words.length;

  // ─── Difficulty score (0–100) ─────────────────────────────
  // Weighted combination, normalized to approx 0–100 range:
  //   avg_sentence_length : weight 0.35 (normalized: typical 10–35 words → /40)
  //   avg_word_length     : weight 0.25 (normalized: typical 4–8 chars → /10)
  //   long_word_ratio     : weight 0.25 (already 0–1)
  //   unique_word_ratio   : weight 0.15 (already 0–1)
  const score =
    (Math.min(avgSentenceLength / 40, 1) * 0.35 +
      Math.min(avgWordLength / 10, 1) * 0.25 +
      longWordRatio * 0.25 +
      uniqueWordRatio * 0.15) *
    100;

  return {
    article_id: article.id,
    avg_sentence_length: Math.round(avgSentenceLength * 10) / 10,
    avg_word_length: Math.round(avgWordLength * 100) / 100,
    long_word_ratio: Math.round(longWordRatio * 1000) / 1000,
    unique_word_ratio: Math.round(uniqueWordRatio * 1000) / 1000,
    difficulty_score: Math.round(score * 100) / 100,
  };
}

// ─── Analyze batch ─────────────────────────────────────────────
function analyzeArticles(articles) {
  const results = [];
  for (const article of articles) {
    const result = analyzeArticle(article);
    if (result) results.push(result);
  }
  console.log(`[ANALYZE] Analyzed ${results.length} / ${articles.length} articles`);
  return results;
}

module.exports = { analyzeArticles, analyzeArticle, tokenizeSentences, tokenizeWords };
