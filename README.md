# Japan GTM Radar

**Decode Japan for US AI startups.** Japan GTM Radar continuously watches how overseas AI startups enter the Japanese market — Japanese-language pages, job boards, partner announcements, corporate registrations — and turns those signals into an **evidence-backed GTM readout**. Then Clay finds the Japan-side people to meet, and the Radar drafts what to say.

The point is to collect *signals*, not to write a new answer every time: every claim links to a source, facts and inferences are kept apart, and unknowns stay visible.

| Step | What you get | Powered by |
|---|---|---|
| 1. Decode the trend | What peers did in Japan, in date order, with sources | Nimble (search, extract, diff) + Jev (typed judgments) |
| 2. Decode the path | Entry paths that may fit you (partner-led resale / co-development / local entity) with caveats | Radar evidence + rules |
| 3. Decode the people | Named Japan-side companies and the people to meet there | Clay Public API |
| 4. Decode the message | English draft + Japanese version, citing only evidence; nothing is sent | Radar evidence |

Quick start (no API keys needed):

```bash
npm install
npm run dev:demo        # http://localhost:3000/decode
```

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
cp .env.example .env    # NIMBLE_API_KEY, TYPESAFE_API_KEY, CLAY_PUBLIC_API_KEY (server-side only, never logged)
APP_MODE=live npx tsx scripts/run-radar.ts     # all companies, or: sierra,cohere
APP_MODE=live npm run dev                      # http://localhost:3000
APP_MODE=demo npm run dev                      # no keys: shows the recorded snapshot in data/demo.json
npm run typecheck && npm run lint && npm test && npm run build
```
Live and demo data are separate files (`data/live.json`, `data/demo.json`).

## Decode Japan (`/decode`)

For an **English-speaking US AI startup** planning to enter Japan. It reads the Radar's evidence about peers that already entered and turns it into four steps. The startup makes every decision; nothing is sent automatically.

1. **Decode the trend** — what each monitored company did in Japan, in date order, with links. Facts and inferences are separate; evidence still waiting for review is shown dashed.
2. **Decode the path** — compares entry paths (partner-led resale / co-development / local entity + direct sales) using **only the peers you selected**. Each path shows its evidence, why it may fit, and caveats (a partner is not a customer, a job posting is not a hire, …). No confirmed evidence → no path, no Clay run, no draft.
3. **Decode the people** — Clay Public API search for Japan-side contacts: people **currently at named target companies** (by domain, `clay.filter_to_companies`), based in Japan, with path-specific titles. Max 1 per company, 3 per run.
4. **Decode the message** — English draft first, plus a Japanese version to send to a Japanese contact. It cites only Radar evidence; anything missing (proof points, sender) stays a visible `[placeholder]`.

Your profile lives in `config/startup-profile.json` (name, one-liner, category, target industries, peers = Radar slugs, sender, proof points). Demo mode shows three fictional startups.

### Clay
- **Demo**: fictional sample people, labelled as samples; no network calls.
- **Live**: `CLAY_PUBLIC_API_KEY` (server-side only) → `POST /public/v0/search/query-mode` → `/run`. Results are shown as real Clay results.
- A run is keyed by its evidence + criteria (`dedupeKey`); the same key is never re-run (also after a timeout). If evidence or criteria change, the old result is hidden, not shown as current. Statuses: queued / running / complete / partial / failed / skipped (not enough evidence). "Not found" is not "failed".
- Limits: max 3 people per run, 1 per company, daily run cap (`LIMITS` in `src/lib/decode.ts`). The free plan allows about 100 searches per 30 days.
- **Clay results are never Radar evidence.** Profiles may be stale or out of scope, and being in Japan doesn't mean owning the decision.
- Findings from live tests (2026-10-16): searching by industry alone returned loosely related people; naming the target companies returned relevant alliance/partnership leads at two of five. The other three returned no one. LinkedIn coverage of Japanese enterprises is thin, and Japanese titles don't map cleanly to English ones.
- Not yet: work-email enrichment (shown as "Not fetched"), Japanese-title search, non-LinkedIn sources.

## Stack
Next.js (App Router) + TypeScript · Nimble Node SDK `@nimble-way/nimble-js` · TypeSafe Jev SDK `@typesafe-ai/sdk` · Clay Public API · JSON file store · Vitest.

## Verified / not yet
- Verified (2026-10-11): live Nimble search + extract → Jev → readout for all 5 companies (~2 min, 21 Nimble + ~130 Jev calls). Second run: unchanged pages create no duplicate evidence, judgments or feed items.
- Not yet (hackathon MVP): add/edit companies and URLs from the UI (config file for now), review/correction buttons, weekly scheduler (run the script from cron).
