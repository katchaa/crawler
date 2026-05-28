'use strict';

const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'output', 'report.html');

// ─── Color helpers ─────────────────────────────────────────────
const SOURCE_COLORS = {
  'iROZHLAS':    '#534AB7',
  'ČT24':        '#1D9E75',
  'Novinky.cz':  '#D85A30',
  'iDnes.cz':    '#C0392B',
  'Aktuálně.cz': '#2471A3',
};

function scoreColor(score) {
  if (score >= 65) return '#D85A30';
  if (score >= 45) return '#BA7517';
  return '#1D9E75';
}

function scoreLabel(score) {
  if (score >= 65) return 'Obtížný';
  if (score >= 45) return 'Střední';
  return 'Jednoduchý';
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n, dec = 1) {
  if (n == null) return '–';
  return Number(n).toFixed(dec);
}

// ─── Bar chart SVG (inline, no libs) ──────────────────────────
function barChart(data, valueKey, labelKey, colorKey, title, unit = '') {
  if (!data.length) return '<p class="empty">Žádná data</p>';
  const max = Math.max(...data.map((d) => d[valueKey] || 0));
  const W = 480, BAR_H = 36, GAP = 10, LABEL_W = 110, PAD = 16;
  const H = data.length * (BAR_H + GAP) + PAD * 2;

  const bars = data.map((d, i) => {
    const val = d[valueKey] || 0;
    const barW = max > 0 ? Math.round((val / max) * (W - LABEL_W - 60)) : 0;
    const y = PAD + i * (BAR_H + GAP);
    const color = colorKey ? (SOURCE_COLORS[d[colorKey]] || '#7F77DD') : '#534AB7';
    const label = String(d[labelKey] || '').substring(0, 18);
    return `
      <g>
        <text x="${LABEL_W - 6}" y="${y + BAR_H / 2 + 5}" text-anchor="end"
          font-size="13" fill="#444441">${esc(label)}</text>
        <rect x="${LABEL_W}" y="${y}" width="${barW}" height="${BAR_H}"
          rx="4" fill="${color}" opacity="0.85"/>
        <text x="${LABEL_W + barW + 6}" y="${y + BAR_H / 2 + 5}"
          font-size="13" fill="#5F5E5A">${fmt(val)}${unit}</text>
      </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:0 auto">
    <title>${esc(title)}</title>${bars}</svg>`;
}

// ─── Mini sparkline for articles per day ──────────────────────
function sparkline(dayData, source) {
  const rows = dayData.filter((d) => d.source === source).slice(0, 14).reverse();
  if (rows.length < 2) return '';
  const counts = rows.map((r) => r.count || 0);
  const max = Math.max(...counts, 1);
  const W = 200, H = 40, step = W / (counts.length - 1);
  const pts = counts.map((c, i) => `${Math.round(i * step)},${Math.round(H - (c / max) * H)}`).join(' ');
  const color = SOURCE_COLORS[source] || '#7F77DD';
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="vertical-align:middle">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
}

// ─── Main report generator ─────────────────────────────────────
function generateReport({ articles, sourceStats, articlesPerDay }) {
  const topArticles = articles.slice(0, 20);
  const generatedAt = new Date().toLocaleString('cs-CZ');

  // Articles per day chart data (last 7 days, all sources combined)
  const dayMap = {};
  for (const d of articlesPerDay) {
    dayMap[d.day] = (dayMap[d.day] || 0) + d.count;
  }
  const dayChartData = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-10)
    .map(([day, count]) => ({ day, count }));

  const totalArticles = articles.length;
  const avgScore = articles.length
    ? Math.round(articles.reduce((s, a) => s + (a.difficulty_score || 0), 0) / articles.length * 10) / 10
    : 0;
  const sources = [...new Set(articles.map((a) => a.source))];

  const html = `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Echo. — Analýza zpravodajských textů</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
    background: #F5F4EF;
    color: #2C2C2A;
    line-height: 1.6;
  }
  header {
    background: #0D0D1A;
    color: #fff;
    padding: 2rem 2.5rem 1.5rem;
  }
  header h1 { font-size: 2.2rem; font-weight: 700; letter-spacing: -0.5px; }
  header h1 span { color: #AFA9EC; }
  header p { color: #888780; font-size: 0.9rem; margin-top: 0.4rem; }
  .container { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }
  .section { margin-bottom: 2.5rem; }
  h2 {
    font-size: 1.2rem; font-weight: 600; color: #534AB7;
    margin-bottom: 1rem; padding-bottom: 0.4rem;
    border-bottom: 2px solid #EEEDFE;
  }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
  .stat-card {
    background: #fff; border-radius: 10px;
    border: 1px solid #D3D1C7;
    padding: 1.2rem 1.4rem;
  }
  .stat-card .label { font-size: 0.78rem; color: #888780; text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-card .value { font-size: 2rem; font-weight: 700; color: #534AB7; line-height: 1.1; margin-top: 0.2rem; }
  .stat-card .sub { font-size: 0.8rem; color: #888780; margin-top: 0.2rem; }
  .source-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
  .source-card {
    background: #fff; border-radius: 10px;
    border: 1px solid #D3D1C7;
    padding: 1.2rem 1.4rem;
  }
  .source-card .source-name {
    font-size: 1rem; font-weight: 700; margin-bottom: 0.8rem;
    padding-bottom: 0.5rem; border-bottom: 2px solid;
  }
  .source-card .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; }
  .source-card .metric .k { font-size: 0.75rem; color: #888780; }
  .source-card .metric .v { font-size: 1.05rem; font-weight: 600; }
  .chart-wrap {
    background: #fff; border-radius: 10px;
    border: 1px solid #D3D1C7;
    padding: 1.4rem;
  }
  .chart-wrap h3 { font-size: 0.9rem; color: #5F5E5A; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th {
    background: #EEEDFE; color: #3C3489;
    padding: 0.6rem 0.8rem; text-align: left;
    font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em;
  }
  td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #F1EFE8; vertical-align: top; }
  tr:hover td { background: #FAFAF7; }
  .badge {
    display: inline-block; padding: 2px 8px;
    border-radius: 20px; font-size: 0.75rem; font-weight: 600;
    white-space: nowrap;
  }
  .score-badge { color: #fff; }
  .source-badge { color: #fff; font-size: 0.72rem; }
  a { color: #534AB7; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .title-cell { max-width: 320px; }
  .title-cell a { color: #2C2C2A; font-weight: 500; }
  .meta { font-size: 0.78rem; color: #888780; margin-top: 2px; }
  .empty { color: #888780; font-style: italic; font-size: 0.9rem; }
  footer {
    background: #0D0D1A; color: #534AB7;
    text-align: center; padding: 1.2rem;
    font-size: 0.82rem; margin-top: 3rem;
  }
</style>
</head>
<body>

<header>
  <h1>Echo<span>.</span> — Analýza zpravodajských textů</h1>
  <p>Vygenerováno: ${esc(generatedAt)} &nbsp;·&nbsp; Zdroje: ${esc(sources.join(', '))}</p>
</header>

<div class="container">

  <!-- SUMMARY STATS -->
  <div class="section">
    <h2>Přehled</h2>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">Článků celkem</div>
        <div class="value">${totalArticles}</div>
        <div class="sub">ze ${sources.length} zdrojů</div>
      </div>
      <div class="stat-card">
        <div class="label">Průměrné skóre obtížnosti</div>
        <div class="value" style="color:${scoreColor(avgScore)}">${fmt(avgScore)}</div>
        <div class="sub">${scoreLabel(avgScore)}</div>
      </div>
      <div class="stat-card">
        <div class="label">Nejobtížnější článek</div>
        <div class="value" style="color:${scoreColor(articles[0]?.difficulty_score || 0)}">${fmt(articles[0]?.difficulty_score || 0)}</div>
        <div class="sub">${esc((articles[0]?.title || '').substring(0, 40))}…</div>
      </div>
      <div class="stat-card">
        <div class="label">Analyzováno dní</div>
        <div class="value">${Object.keys(dayMap).length}</div>
        <div class="sub">zpětně</div>
      </div>
    </div>
  </div>

  <!-- SOURCE COMPARISON -->
  <div class="section">
    <h2>Srovnání zdrojů</h2>
    <div class="source-cards">
      ${sourceStats.map((s) => {
        const color = SOURCE_COLORS[s.source] || '#7F77DD';
        return `<div class="source-card">
          <div class="source-name" style="color:${color};border-color:${color}">${esc(s.source)}</div>
          <div style="margin-bottom:0.8rem">${sparkline(articlesPerDay, s.source)}</div>
          <div class="metrics">
            <div class="metric"><div class="k">Článků</div><div class="v">${s.article_count}</div></div>
            <div class="metric"><div class="k">Avg. obtížnost</div><div class="v" style="color:${scoreColor(s.avg_difficulty)}">${fmt(s.avg_difficulty)}</div></div>
            <div class="metric"><div class="k">Avg. délka věty</div><div class="v">${fmt(s.avg_sentence_len)} slov</div></div>
            <div class="metric"><div class="k">Avg. délka slova</div><div class="v">${fmt(s.avg_word_len, 2)} zn.</div></div>
            <div class="metric"><div class="k">Dlouhá slova</div><div class="v">${fmt(s.long_word_pct)} %</div></div>
            <div class="metric"><div class="k">Unikátní slova</div><div class="v">${fmt(s.unique_word_pct)} %</div></div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- DIFFICULTY CHART -->
  <div class="section">
    <h2>Skóre obtížnosti — srovnání zdrojů</h2>
    <div class="chart-wrap">
      <h3>Průměrné skóre obtížnosti textu (0–100)</h3>
      ${barChart(sourceStats, 'avg_difficulty', 'source', 'source', 'Obtížnost podle zdroje')}
    </div>
  </div>

  <!-- TIMELINE -->
  <div class="section">
    <h2>Počet článků v čase</h2>
    <div class="chart-wrap">
      <h3>Celkový počet článků za posledních ${dayChartData.length} dní</h3>
      ${barChart(dayChartData, 'count', 'day', null, 'Články za den')}
    </div>
  </div>

  <!-- TOP ARTICLES TABLE -->
  <div class="section">
    <h2>Top 20 nejobtížnějších článků</h2>
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Zdroj</th>
          <th>Titulek</th>
          <th>Skóre</th>
          <th>Avg. věta</th>
          <th>Avg. slovo</th>
          <th>Dl. slova</th>
          <th>Uniq. slova</th>
        </tr>
      </thead>
      <tbody>
        ${topArticles.map((a, i) => {
          const scolor = SOURCE_COLORS[a.source] || '#7F77DD';
          const sc = a.difficulty_score || 0;
          return `<tr>
            <td>${i + 1}</td>
            <td><span class="badge source-badge" style="background:${scolor}">${esc(a.source)}</span></td>
            <td class="title-cell">
              <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>
              <div class="meta">${esc(a.rubric || '')} · ${esc((a.published_at || '').substring(0, 10))}</div>
            </td>
            <td><span class="badge score-badge" style="background:${scoreColor(sc)}">${fmt(sc)}</span></td>
            <td>${fmt(a.avg_sentence_length)}</td>
            <td>${fmt(a.avg_word_length, 2)}</td>
            <td>${fmt((a.long_word_ratio || 0) * 100)} %</td>
            <td>${fmt((a.unique_word_ratio || 0) * 100)} %</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
  </div>

</div>

<footer>
  Echo. &nbsp;·&nbsp; Antidezinformační kampaň &nbsp;·&nbsp; Zvol si info, z. s. &nbsp;·&nbsp;
  Vygenerováno automaticky crawlerem &nbsp;·&nbsp; ${esc(generatedAt)}
</footer>

</body>
</html>`;

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, html, 'utf8');
  console.log(`[REPORT] HTML report saved → ${OUT_PATH}`);
  return OUT_PATH;
}

module.exports = { generateReport };
