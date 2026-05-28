# Echo. — News Crawler & Text Difficulty Analyzer

Automatizovaný nástroj pro sběr článků z českých zpravodajských webů, analýzu obtížnosti textu a generování HTML reportu.

---

## Funkcionalita

1. **Sběr dat** — stahuje články z RSS kanálů iROZHLAS, ČT24, Novinky.cz, iDnes.cz a Aktuálně.cz, respektuje `robots.txt` a rozumnou frekvenci požadavků
2. **Čistění a uložení** — odstraní HTML, deduplikuje, normalizuje text a uloží do SQLite databáze
3. **Analýza obtížnosti** — vypočítá jazykové metriky a skóre obtížnosti pro každý článek
4. **HTML report** — automaticky vygeneruje přehlednou statickou HTML stránku s výsledky

---

## Technické informace

| Položka       | Hodnota                            |
| ------------- | ---------------------------------- |
| Jazyk         | Node.js                            |
| Verze Node.js | ≥ 18.0.0 (testováno na 22.x)       |
| Databáze      | SQLite (soubor `data/articles.db`) |
| Výstup        | `output/report.html`               |

### Závislosti (npm)

| Packages        | Verze   | Účel                                       |
| --------------- | ------- | ------------------------------------------ |
| `sql.js`        | ^1.14.1 | SQLite v čistém JS (bez nativní kompilace) |
| `rss-parser`    | ^3.13.0 | Parsování RSS/Atom kanálů                  |
| `axios`         | ^1.16.1 | HTTP klient pro stahování článků           |
| `cheerio`       | ^1.2.0  | Parsování a extrakce HTML obsahu           |
| `robots-parser` | ^3.0.1  | Čtení robots.txt                           |

---

## Požadavky na prostředí

- **OS:** Windows, macOS nebo Linux
- **Node.js:** verze 18 nebo vyšší
  ```bash
  node --version   # musí být ≥ 18
  ```
- **npm:** instalován spolu s Node.js
- **Síťový přístup:** pro live crawl (RSS feeds + weby zdrojů)

---

## Instalace

```bash
npm install
```

---

## Spuštění

### Live crawl (produkční režim)

```bash
# Základní spuštění — poslední 7 dní, max 25 článků na zdroj
node index.js

# Pouze posledních 3 dny
node index.js --days 3

# Max 10 článků na zdroj (rychlejší, méně dat)
node index.js --max 10

# Kombinace
node index.js --days 5 --max 15
```

### Demo režim (bez sítě)

```bash
# Offline demo se seed daty (15 předpřipravených článků)
node index.js --demo
```

### Přeskočení sběru dat (jen re-analýza)

```bash
# Přeskočí crawl, znovu analyzuje a vygeneruje report ze stávající DB
node index.js --skip-collect
```

### Výstup

Po spuštění se vytvoří:

- `data/articles.db` — SQLite databáze s články a výsledky analýzy
- `output/report.html` — HTML stránka s výsledky (otevřete v prohlížeči)

```bash
# Otevření reportu v prohlížeči
xdg-open output/report.html   # Linux
open output/report.html       # macOS
start output/report.html      # Windows
```

---

## Struktura projektu

```
crawler/
├── index.js              # Hlavní entrypoint — spouští celý pipeline
├── package.json
├── package-lock.json
├── README.md
├── .gitignore
├── src/
│   ├── collect.js        # Sběr dat z RSS a scrapování článků
│   ├── clean.js          # Čistění textu, deduplikace, normalizace
│   ├── db.js             # Databázová vrstva (sql.js / SQLite)
│   ├── analyze.js        # Výpočet jazykových metrik a skóre
│   ├── report.js         # Generování HTML reportu
│   └── seed.js           # Seed data pro demo/offline režim
├── data/
│   └── articles.db       # SQLite databázový soubor (generován při běhu, v .gitignore)
└── output/
    └── report.html       # HTML report (generován při běhu, v .gitignore)
```

---

## Workflow aplikace

```
RSS kanály (iROZHLAS / ČT24 / Novinky.cz / iDnes.cz / Aktuálně.cz)
        │
        ▼
[1] collect.js — fetchFeed()
    • Stažení RSS položek (title, url, pubDate, author)
    • Kontrola robots.txt před každým požadavkem (cache per doménu)
    • Pro každou položku: HTTP GET na URL článku
    • Extrakce textu přes cheerio (CSS selektory)
    • Delay 1–2 s mezi požadavky, timeout 12–15 s
        │
        ▼
[2] clean.js — cleanArticles()
    • Odstranění HTML entit a zbytků značek
    • Odstranění URL a e-mailových adres
    • Normalizace whitespace
    • Deduplikace podle URL
    • Quality gate: min. 200 znaků textu, min. 5 znaků titulku
        │
        ▼
    • Uložení do tabulky articles (INSERT OR IGNORE) — db.js
    • Persistování SQLite souboru na disk
        │
        ▼
[3] analyze.js — analyzeArticles()
    • Tokenizace textu na věty (regex, Czech-aware)
    • Tokenizace na slova (lowercase, bez interpunkce)
    • Výpočet metrik (viz níže)
    • Uložení výsledků do tabulky analysis
        │
        ▼
[4] report.js — generateReport()
    • Načtení dat z DB (JOIN articles + analysis)
    • Generování inline SVG grafů (bez závislostí)
    • Zápis output/report.html
```

---

## Analytické metriky

Analýza probíhá v modulu `src/analyze.js` ve dvou krocích: nejprve tokenizace textu, pak výpočet metrik.

### Tokenizace

**Věty** jsou detekovány regulárním výrazem, který rozděluje text na místech kde za tečkou, vykřičníkem nebo otazníkem následuje mezera a velké písmeno (včetně českých velkých písmen s diakritikou). Příliš krátké úseky (méně než 3 slova) jsou ignorovány jako fragmenty.

**Slova** jsou tokenizována převodem na lowercase, odstraněním interpunkce a čísel, a rozdělením podle mezer. Zachována jsou pouze slova obsahující alespoň jedno písmeno české abecedy a delší než 1 znak — funkční slova jako předložky a spojky tak zůstávají v analýze a přirozeně snižují skóre obtížnosti u jednodušších textů.

### Vypočítané metriky

| Metrika               | Popis                                                                  |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| `avg_sentence_length` | Průměrný počet slov na větu                                            | 10–20 slov (zpravodajství), 20–35 (odborné texty) |
| `avg_word_length`     | Průměrný počet znaků na slovo                                          | 4–5 (bulvár), 6–8 (odborný text)                  |
| `long_word_ratio`     | Podíl slov s 6 a více znaky (0–1)                                      | 0.35–0.55 (zpravodajství)                         |
| `unique_word_ratio`   | Type-token ratio — podíl unikátních slov ku celkovému počtu slov (0–1) | 0.4–0.7 (kratší texty mají vyšší TTR)             |
| `difficulty_score`    | Složené skóre obtížnosti (0–100)                                       | 30–50 průměr zpravodajství                        |

### Výpočet `difficulty_score`

Skóre je váženým součtem čtyř normalizovaných metrik:

```
score = (
  min(avg_sentence_length / 40, 1) × 0.35     -- délka vět: váha 35 %
  + min(avg_word_length / 10, 1)   × 0.25     -- délka slov: váha 25 %
  + long_word_ratio                × 0.25     -- podíl dlouhých slov: váha 25 %
  + unique_word_ratio              × 0.15     -- slovní bohatost: váha 15 %
) × 100
```

**Proč takové váhy?** Délka vět je považována za nejsilnější indikátor čtivosti textu (proto 35 %) — dlouhé souvětí klade větší nároky na čtenářovu pracovní paměť. Délka slov a podíl dlouhých slov (dohromady 50 %) zachycují složitost slovní zásoby. Slovní bohatost (TTR, 15 %) doplňuje obraz — text s vysokým podílem unikátních slov vyžaduje širší slovní zásobu čtenáře, ale u kratších článků přirozeně vychází vyšší, proto dostává nejnižší váhu.

**Normalizace:** každá metrika je před součtem normalizována do rozsahu 0–1 pomocí `min(hodnota / maximum, 1)`, kde maximum odpovídá horní hranici typického rozsahu pro danou metriku (40 slov/větu, 10 znaků/slovo). Výsledek je pak vynásoben 100 pro lepší čitelnost.

Vyšší skóre = obtížnější text. Skóre pod 45 odpovídá jednoduchému textu (bulvár, krátké zprávy), 45–65 středně obtížnému zpravodajství, nad 65 analytickým a komentářovým textům.

---

## Struktura databáze

```
articles
┌─────────────┬─────────┬──────────────────────────────────┐
│ id          │ INTEGER │ PK, autoincrement                 │
│ source      │ TEXT    │ Název zdroje (iROZHLAS, ČT24 …)  │
│ url         │ TEXT    │ URL článku (UNIQUE)               │
│ title       │ TEXT    │ Titulek                           │
│ published_at│ TEXT    │ ISO 8601 datum publikace          │
│ author      │ TEXT    │ Autor (může být NULL)             │
│ rubric      │ TEXT    │ Rubrika / sekce webu              │
│ text        │ TEXT    │ Plný text článku                  │
│ word_count  │ INTEGER │ Počet slov v textu                │
│ created_at  │ TEXT    │ Čas vložení do DB                 │
└─────────────┴─────────┴──────────────────────────────────┘

analysis
┌──────────────────────┬─────────┬───────────────────────────┐
│ id                   │ INTEGER │ PK, autoincrement          │
│ article_id           │ INTEGER │ FK → articles.id (UNIQUE)  │
│ avg_sentence_length  │ REAL    │ Průměrná délka věty        │
│ avg_word_length      │ REAL    │ Průměrná délka slova       │
│ long_word_ratio      │ REAL    │ Podíl dlouhých slov (0–1)  │
│ unique_word_ratio    │ REAL    │ Type-token ratio (0–1)     │
│ difficulty_score     │ REAL    │ Skóre obtížnosti (0–100)   │
│ analyzed_at          │ TEXT    │ Čas analýzy                │
└──────────────────────┴─────────┴───────────────────────────┘

Indexy: idx_articles_source, idx_articles_published
Vztah:  analysis.article_id → articles.id  (1:1)
```

---

## Respektování pravidel pro automatizovaný přístup

- **User-Agent** identifikuje bota jako akademický projekt
- **Delay 1–2 sekundy** mezi každým HTTP požadavkem (náhodný)
- **robots.txt** je stažen a zkontrolován před každým požadavkem; URL zakázané crawlerem jsou přeskočeny (výsledek cachován per doménu)
- **Pouze RSS a veřejné URL** — žádné přihlášení, žádný paywall
- **Timeout 12–15 sekund** na požadavek, chyby jsou tiše přeskočeny
- Crawlujeme pouze weby, které RSS kanály samy nabízejí jako veřejný výstup
- Poznámka: některé weby (např. iROZHLAS) mohou blokovat přístup botu i přes zdvořilý User-Agent; v takovém případě jsou dané články přeskočeny

---

## Poznámky

- Databázový soubor `data/articles.db` je přenositelný — lze ho otevřít libovolným SQLite klientem (DB Browser for SQLite, DBeaver aj.)
- HTML report nevyžaduje žádné externí závislosti — funguje offline, neobsahuje žádné CDN odkazy
- Demo režim (`--demo`) nevyžaduje síťové připojení a slouží k demonstraci funkcionality
