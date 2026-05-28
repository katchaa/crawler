'use strict';

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '..', 'data', 'articles.db');

let _db = null;

// ─── Init / load DB ────────────────────────────────────────────
async function getDb() {
  if (_db) return _db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  _createSchema(_db);
  return _db;
}

function _createSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source      TEXT    NOT NULL,
      url         TEXT    NOT NULL UNIQUE,
      title       TEXT    NOT NULL,
      published_at TEXT,
      author      TEXT,
      rubric      TEXT,
      text        TEXT    NOT NULL,
      word_count  INTEGER,
      created_at  TEXT    DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS analysis (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id          INTEGER NOT NULL UNIQUE REFERENCES articles(id),
      avg_sentence_length REAL,
      avg_word_length     REAL,
      long_word_ratio     REAL,
      unique_word_ratio   REAL,
      difficulty_score    REAL,
      analyzed_at         TEXT DEFAULT (datetime('now'))
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);`);
}

// ─── Persist to disk ───────────────────────────────────────────
async function save() {
  if (!_db) return;
  const data = _db.export();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Insert articles ───────────────────────────────────────────
async function insertArticles(articles) {
  const db = await getDb();
  let inserted = 0;
  let skipped = 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO articles
      (source, url, title, published_at, author, rubric, text, word_count)
    VALUES
      (@source, @url, @title, @published_at, @author, @rubric, @text, @word_count)
  `);

  for (const a of articles) {
    const wordCount = a.text.split(/\s+/).filter(Boolean).length;
    stmt.run({
      '@source': a.source,
      '@url': a.url,
      '@title': a.title,
      '@published_at': a.published_at,
      '@author': a.author || null,
      '@rubric': a.rubric || null,
      '@text': a.text,
      '@word_count': wordCount,
    });
    const changes = db.getRowsModified();
    if (changes > 0) inserted++;
    else skipped++;
  }

  stmt.free();
  await save();
  console.log(`[DB] Inserted: ${inserted}, Skipped (duplicate): ${skipped}`);
  return inserted;
}

// ─── Load all articles ─────────────────────────────────────────
async function getAllArticles() {
  const db = await getDb();
  const res = db.exec('SELECT * FROM articles ORDER BY published_at DESC');
  if (!res.length) return [];
  return rowsToObjects(res[0]);
}

// ─── Load articles without analysis ───────────────────────────
async function getUnanalyzedArticles() {
  const db = await getDb();
  const res = db.exec(`
    SELECT a.* FROM articles a
    LEFT JOIN analysis an ON a.id = an.article_id
    WHERE an.id IS NULL
  `);
  if (!res.length) return [];
  return rowsToObjects(res[0]);
}

// ─── Insert analysis results ───────────────────────────────────
async function insertAnalysis(results) {
  const db = await getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO analysis
      (article_id, avg_sentence_length, avg_word_length, long_word_ratio, unique_word_ratio, difficulty_score)
    VALUES
      (@article_id, @avg_sentence_length, @avg_word_length, @long_word_ratio, @unique_word_ratio, @difficulty_score)
  `);

  for (const r of results) {
    stmt.run({
      '@article_id': r.article_id,
      '@avg_sentence_length': r.avg_sentence_length,
      '@avg_word_length': r.avg_word_length,
      '@long_word_ratio': r.long_word_ratio,
      '@unique_word_ratio': r.unique_word_ratio,
      '@difficulty_score': r.difficulty_score,
    });
  }
  stmt.free();
  await save();
}

// ─── Get full analysis join ────────────────────────────────────
async function getAnalyzedArticles() {
  const db = await getDb();
  const res = db.exec(`
    SELECT
      a.id, a.source, a.url, a.title, a.published_at, a.author, a.rubric, a.word_count,
      an.avg_sentence_length, an.avg_word_length, an.long_word_ratio,
      an.unique_word_ratio, an.difficulty_score
    FROM articles a
    JOIN analysis an ON a.id = an.article_id
    ORDER BY an.difficulty_score DESC
  `);
  if (!res.length) return [];
  return rowsToObjects(res[0]);
}

// ─── Aggregate stats per source ────────────────────────────────
async function getSourceStats() {
  const db = await getDb();
  const res = db.exec(`
    SELECT
      a.source,
      COUNT(*)                        AS article_count,
      ROUND(AVG(an.difficulty_score), 2) AS avg_difficulty,
      ROUND(AVG(an.avg_sentence_length), 1) AS avg_sentence_len,
      ROUND(AVG(an.avg_word_length), 2) AS avg_word_len,
      ROUND(AVG(an.long_word_ratio) * 100, 1) AS long_word_pct,
      ROUND(AVG(an.unique_word_ratio) * 100, 1) AS unique_word_pct
    FROM articles a
    JOIN analysis an ON a.id = an.article_id
    GROUP BY a.source
    ORDER BY avg_difficulty DESC
  `);
  if (!res.length) return [];
  return rowsToObjects(res[0]);
}

// ─── Articles per day ──────────────────────────────────────────
async function getArticlesPerDay() {
  const db = await getDb();
  const res = db.exec(`
    SELECT
      DATE(published_at) AS day,
      source,
      COUNT(*) AS count
    FROM articles
    WHERE published_at IS NOT NULL
    GROUP BY day, source
    ORDER BY day DESC
  `);
  if (!res.length) return [];
  return rowsToObjects(res[0]);
}

// ─── Util: sql.js result → array of objects ────────────────────
function rowsToObjects({ columns, values }) {
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

module.exports = {
  getDb, save,
  insertArticles, getAllArticles, getUnanalyzedArticles,
  insertAnalysis, getAnalyzedArticles, getSourceStats, getArticlesPerDay,
};
