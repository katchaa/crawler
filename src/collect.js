'use strict';

const RSSParser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const { SEED_ARTICLES } = require('./seed');

const parser = new RSSParser({ timeout: 15000 });

// ─── Source definitions ────────────────────────────────────────
const SOURCES = [
  {
    name: 'iROZHLAS',
    feeds: [
      'https://www.irozhlas.cz/rss/irozhlas',
      'https://www.irozhlas.cz/rss/irozhlas/section/zpravy-domov',
      'https://www.irozhlas.cz/rss/irozhlas/section/zpravy-svet',
    ],
    articleSelector: 'article, .b-article__body, .article-body, .content-text',
    paragraphSelector: 'p',
  },
  {
    name: 'ČT24',
    feeds: [
      'https://ct24.ceskatelevize.cz/rss/hlavni-zpravy',
      'https://ct24.ceskatelevize.cz/rss/domaci',
      'https://ct24.ceskatelevize.cz/rss/svet',
    ],
    articleSelector: '.article-body, .b-article, [class*="article"]',
    paragraphSelector: 'p',
  },
  {
    name: 'Novinky.cz',
    feeds: [
      'https://www.novinky.cz/rss',
      'https://www.novinky.cz/rss/domaci',
      'https://www.novinky.cz/rss/zahranicni',
    ],
    articleSelector: '.article-content, .article-body, article',
    paragraphSelector: 'p',
  },
  {
    name: 'iDnes.cz',
    feeds: [
      'https://servis.idnes.cz/rss.aspx?c=zpravodaj',
      'https://servis.idnes.cz/rss.aspx?c=domaci',
      'https://servis.idnes.cz/rss.aspx?c=zahranicni',
    ],
    articleSelector: '.article-body, .opener, [class*="article-body"]',
    paragraphSelector: 'p',
  },
  {
    name: 'Aktuálně.cz',
    feeds: [
      'https://zpravy.aktualne.cz/rss.xml',
      'https://zpravy.aktualne.cz/domaci/rss.xml',
      'https://zpravy.aktualne.cz/zahranici/rss.xml',
    ],
    articleSelector: '.article-body, [class*="article-content"], .g_a',
    paragraphSelector: 'p',
  },
];

// Respectful delay between requests (1–2 seconds)
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = () => delay(1000 + Math.random() * 1000);

const USER_AGENT =
  'Mozilla/5.0 (compatible; EchoBot/1.0; academic research; +https://github.com/echo-campaign)';

// ─── robots.txt cache (one fetch per domain per run) ──────────
const _robotsCache = new Map();

async function getRobots(url) {
  const origin = new URL(url).origin;
  if (_robotsCache.has(origin)) return _robotsCache.get(origin);

  const robotsUrl = `${origin}/robots.txt`;
  try {
    const resp = await axios.get(robotsUrl, {
      timeout: 5000,
      headers: { 'User-Agent': USER_AGENT },
    });
    const robots = robotsParser(robotsUrl, resp.data);
    _robotsCache.set(origin, robots);
    return robots;
  } catch {
    // Unreachable robots.txt → treat as allowed
    _robotsCache.set(origin, null);
    return null;
  }
}

// ─── Fetch RSS feed ────────────────────────────────────────────
async function fetchFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items || [];
  } catch (err) {
    console.warn(`  [WARN] RSS failed (${url}): ${err.message}`);
    return [];
  }
}

// ─── Extract article text from HTML ───────────────────────────
function extractText($, source) {
  const candidates = [
    source.articleSelector,
    'article',
    '.article-body',
    '.article-content',
    '.content',
    'main',
  ];

  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length) {
      // Remove nav, ads, related articles, scripts, styles
      el.find('nav, aside, .related, .advertisement, .ad, script, style, figure, figcaption, .social-share').remove();
      const paragraphs = el.find('p')
        .map((_, p) => $(p).text().trim())
        .get()
        .filter((t) => t.length > 40);
      if (paragraphs.length > 1) return paragraphs.join(' ');
    }
  }

  // Fallback: all <p> tags on page with decent length
  const fallback = $('p')
    .map((_, p) => $(p).text().trim())
    .get()
    .filter((t) => t.length > 60)
    .slice(0, 30);
  return fallback.join(' ');
}

// ─── Scrape single article ─────────────────────────────────────
async function scrapeArticle(item, sourceName, sourceDef) {
  const url = item.link || item.guid;
  if (!url || !url.startsWith('http')) return null;

  try {
    const robots = await getRobots(url);
    if (robots && !robots.isAllowed(url, USER_AGENT)) {
      console.warn(`  [ROBOTS] Blocked by robots.txt: ${url}`);
      return null;
    }

    const resp = await axios.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'cs,en;q=0.9',
      },
      maxRedirects: 5,
    });

    const $ = cheerio.load(resp.data);

    // Extract fields
    const title =
      item.title ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      '';

    const author =
      item.creator ||
      item.author ||
      $('[rel="author"], .author, .byline, [class*="author"]').first().text().trim() ||
      null;

    const pubDate =
      item.pubDate ||
      item.isoDate ||
      $('time[datetime]').first().attr('datetime') ||
      null;

    // Detect rubric from URL path or meta
    const urlPath = new URL(url).pathname;
    const segments = urlPath.split('/').filter(Boolean);
    const rubric = segments.length > 1 ? segments[0] : 'nezarazeno';

    const text = extractText($, sourceDef);

    if (!title || text.length < 200) return null;

    return {
      source: sourceName,
      url,
      title: title.substring(0, 500),
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      author: author ? author.substring(0, 200) : null,
      rubric: rubric.substring(0, 100),
      text,
    };
  } catch (err) {
    console.warn(`  [WARN] Scrape failed (${url}): ${err.message}`);
    return null;
  }
}

// ─── Main collect function ─────────────────────────────────────
async function collect(options = {}) {
  const {
    maxPerSource = 25,
    daysCutoff = 7,
  } = options;

  const cutoff = new Date(Date.now() - daysCutoff * 24 * 60 * 60 * 1000);
  const articles = [];

  for (const source of SOURCES) {
    console.log(`\n[COLLECT] ${source.name}`);
    const seenUrls = new Set();
    let collected = 0;

    for (const feedUrl of source.feeds) {
      if (collected >= maxPerSource) break;
      console.log(`  Feed: ${feedUrl}`);
      const items = await fetchFeed(feedUrl);
      console.log(`  Items found: ${items.length}`);

      for (const item of items) {
        if (collected >= maxPerSource) break;
        const url = item.link || item.guid;
        if (!url || seenUrls.has(url)) continue;
        seenUrls.add(url);

        // Date filter
        if (item.pubDate || item.isoDate) {
          const pub = new Date(item.pubDate || item.isoDate);
          if (pub < cutoff) continue;
        }

        await randomDelay();
        const article = await scrapeArticle(item, source.name, source);
        if (article) {
          articles.push(article);
          collected++;
          process.stdout.write(`  [${collected}/${maxPerSource}] OK: ${article.title.substring(0, 60)}…\n`);
        }
      }
    }

    console.log(`  Total from ${source.name}: ${collected}`);
  }

  console.log(`\n[COLLECT] Done. Total articles: ${articles.length}`);
  return articles;
}

// ─── Demo / offline mode ───────────────────────────────────────
async function collectDemo() {
  console.log('[COLLECT] Demo mode: using seed data (15 articles)');
  return SEED_ARTICLES;
}

module.exports = { collect, collectDemo };
