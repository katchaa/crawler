'use strict';

// ─── Clean raw article text ────────────────────────────────────
function cleanText(raw) {
  if (!raw) return '';

  return raw
    // Remove HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    // Remove any leftover HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Remove URLs
    .replace(/https?:\/\/\S+/g, ' ')
    // Remove email addresses
    .replace(/\S+@\S+\.\S+/g, ' ')
    // Normalize whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Clean article title ───────────────────────────────────────
function cleanTitle(raw) {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Deduplicate by URL (keep first seen) ─────────────────────
function deduplicate(articles) {
  const seen = new Set();
  return articles.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}

// ─── Process a batch of raw articles ──────────────────────────
function cleanArticles(articles) {
  const deduped = deduplicate(articles);

  return deduped
    .map((a) => ({
      ...a,
      title: cleanTitle(a.title),
      text: cleanText(a.text),
      author: a.author ? a.author.replace(/\s+/g, ' ').trim() : null,
      rubric: a.rubric ? a.rubric.toLowerCase().trim() : 'nezarazeno',
    }))
    .filter((a) => {
      // Minimum quality gate
      if (!a.title || a.title.length < 5) return false;
      if (!a.text || a.text.length < 200) return false;
      return true;
    });
}

module.exports = { cleanText, cleanTitle, deduplicate, cleanArticles };
