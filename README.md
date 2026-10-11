# Japan GTM Radar / 日本GTMレーダー

Continuously observes how overseas AI startups show interest in, invest in, and sell into the Japanese market, and turns that into an **evidence-backed GTM readout**.
海外AIスタートアップの日本市場への関心・投資・事業展開を継続観測し、根拠付きのGTMヨミ表を作るMVP。

Initial targets: Sierra, Corgi, Braintrust, Cohere, ElevenLabs (`config/companies.json`).

## Pipeline

```
Nimble Search (discovery)  ┐
Nimble Extract (monitor)   ┴→ fetch history + snapshot → diff vs previous → Jev typed questions → readout / feed
```

1. **Discovery** (`discoverCompany`): Nimble `search` (`country: JP`, `locale: ja`) finds new Japan-related sources. Publish date (parsed) is stored separately from fetch date.
2. **Monitoring** (`monitorSource`): Nimble `extract` re-fetches registered URLs (official JP pages, Ashby job boards). Normalized text is hashed; unchanged pages create no new snapshot/evidence/feed.
3. **Diff**: line-set diff with navigation/cosmetic noise removed; jobs diffed by posting ID → added / changed / no longer listed.
4. **Jev judgment** (`judgeEvidence`): typed questions via `@typesafe-ai/sdk` `systemOne` — same-company check (noul), Japan scope (choice: Japan-only / APAC / global / unrelated), 9 signal-presence nouls, then per-signal status (intent/plan · executed · continued/expanded) and signal-specific details (trial vs production, partner vs investor, real ambassador vs recruitment copy…). Model, question-set version, input hash, state, answers and usage are stored; identical input is never re-judged.
5. **Assessment** (`assessCompany`): aggregates signals → GTM stage (Jev choice + deterministic caps) and sales motions (Jev nouls). Hypothesis / facts / counter-points / next checks are templated from judgments + evidence.

## Guardrails (`src/lib/pipeline.ts`)
- Facts and inferences are separate fields; unconfirmed ≠ zero; no scores or rankings.
- Job posting ≠ completed hire; closed listing ≠ completed hire.
- Translated page ≠ Japan-dedicated team; ambassador recruitment ≠ existing ambassador.
- Plan / trial / production distinguished; investors and partners are not counted as customers.
- Reprints de-duplicated (4-gram Jaccard); old evidence flagged; fetch failure ≠ absence (last success kept).
- Low confidence or borderline same-company (e.g. "株式会社CORGI" vs Corgi Insurance) → **Needs review**, excluded from the readout until reviewed.
- Jev confidence and source reliability are shown separately. Thresholds live in `config/judging.json`.

## Run

```bash
npm install
cp .env.example .env    # NIMBLE_API_KEY, TYPESAFE_API_KEY (server-side only, never logged)
APP_MODE=live npx tsx scripts/run-radar.ts     # all companies, or: sierra,cohere
APP_MODE=live npm run dev                      # http://localhost:3000
APP_MODE=demo npm run dev                      # no keys: shows the recorded snapshot in data/demo.json
```
Live and demo data are separate files (`data/live.json`, `data/demo.json`).

## Stack
Next.js (App Router) + TypeScript · Nimble Node SDK `@nimble-way/nimble-js` · TypeSafe Jev SDK `@typesafe-ai/sdk` · JSON file store.

## Verified / not yet
- Verified (2026-10-11): live Nimble search + extract → Jev → readout for all 5 companies (~2 min, 21 Nimble + ~130 Jev calls). Second run: unchanged pages create no duplicate evidence, judgments or feed items.
- Not yet (hackathon MVP): add/edit companies and URLs from the UI (config file for now), review/correction buttons, automated tests, weekly scheduler (run the script from cron).
