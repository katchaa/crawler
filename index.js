#!/usr/bin/env node
'use strict';

/**
 * Echo. — News Crawler & Text Difficulty Analyzer
 *
 * Usage:
 *   node index.js                   # full live crawl (last 7 days, 25/source)
 *   node index.js --days 3          # last 3 days only
 *   node index.js --max 10          # max 10 articles per source
 *   node index.js --demo            # offline demo with seed data (no network)
 *   node index.js --skip-collect    # skip collection, re-analyze existing DB
 */

const { collect, collectDemo } = require('./src/collect');
const { cleanArticles }        = require('./src/clean');
const { analyzeArticles }      = require('./src/analyze');
const { generateReport }       = require('./src/report');
const db                       = require('./src/db');

const args        = process.argv.slice(2);
const getArg      = (f, d) => { const i = args.indexOf(f); return i !== -1 && args[i+1] ? args[i+1] : d; };
const hasFlag     = (f) => args.includes(f);

const MAX_PER_SOURCE = parseInt(getArg('--max', '25'), 10);
const DAYS_CUTOFF    = parseInt(getArg('--days', '7'), 10);
const SKIP_COLLECT   = hasFlag('--skip-collect');
const DEMO_MODE      = hasFlag('--demo');

async function run() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Echo. — News Crawler & Analyzer    ║');
  console.log(`║   Mode: ${DEMO_MODE ? 'DEMO (seed data)        ' : SKIP_COLLECT ? 'SKIP COLLECT           ' : `Live (${DAYS_CUTOFF}d, ${MAX_PER_SOURCE}/src)       `}║`);
  console.log('╚══════════════════════════════════════╝\n');

  const t0 = Date.now();

  // ── Step 1 & 2: Collect + Clean + Store ─────────────────────
  if (!SKIP_COLLECT) {
    console.log('[STEP 1/4] Collecting articles…');
    const raw = DEMO_MODE
      ? await collectDemo()
      : await collect({ maxPerSource: MAX_PER_SOURCE, daysCutoff: DAYS_CUTOFF });

    console.log('\n[STEP 2/4] Cleaning and storing data…');
    const cleaned = cleanArticles(raw);
    console.log(`  Cleaned: ${cleaned.length} / ${raw.length} articles passed quality gate`);
    await db.insertArticles(cleaned);
  } else {
    console.log('[STEP 1-2] Skipping collection (--skip-collect)');
    const existing = await db.getUnanalyzedArticles();
    const analyzed = await db.getAnalyzedArticles();
    if (existing.length === 0 && analyzed.length === 0) {
      console.warn('[WARN] Database is empty — run without --skip-collect first.');
    }
  }

  // ── Step 3: Analyze ──────────────────────────────────────────
  console.log('\n[STEP 3/4] Running text difficulty analysis…');
  const toAnalyze = await db.getUnanalyzedArticles();
  if (toAnalyze.length > 0) {
    const results = analyzeArticles(toAnalyze);
    await db.insertAnalysis(results);
  } else {
    console.log('[ANALYZE] All articles already analyzed');
  }

  // ── Step 4: Generate report ───────────────────────────────────
  console.log('\n[STEP 4/4] Generating HTML report…');
  const [articles, sourceStats, articlesPerDay] = await Promise.all([
    db.getAnalyzedArticles(),
    db.getSourceStats(),
    db.getArticlesPerDay(),
  ]);

  generateReport({ articles, sourceStats, articlesPerDay });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  Done in ${elapsed}s`);
  console.log(`║  Articles in DB : ${articles.length}`);
  console.log(`║  Report         : output/report.html`);
  console.log('╚══════════════════════════════════════╝\n');
}

run().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
