# PD2 Meta

Builds and gear meta for Project Diablo 2 ladder characters. Two tabs:

- **Builds**: browse ladder characters by class and skills, with usage cards, gear value in HR, a shopping list, character and account pages.
- **Meta**: for one cohort (class, skills, minimum level, mode) the most worn items per slot with own prices, affix frequencies, charm patterns, average stats, a build sheet and a diff against one character.

Live at **https://www.pd2meta.info** (pd2-aggregator.vercel.app redirects there).

## Architecture

- `server/`: collector, Postgres and read API (`api.pd2meta.info`) on the VPS. The Meta aggregation runs server side in `server/src/api/meta/`.
- Web (repo root): Next.js 16 static export on Vercel. It only renders what the API returns.
- Deploy: see [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md).

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # web tests
npm run typecheck
npm run lint
npm run build        # static export to out/
cd server && npm test
```

## Data sources

- Character and market data: the official Project Diablo 2 API, collected by `server/`.
- Prices: own `item_prices` (Unique, Set, Runeword and Rune medians from `market_listings`, hourly, sold listings preferred).
- Item and skill data: PD2 wiki, kept in `data/*.json`.
- Build tiers: Dark Humility tier list (Google Sheet) via pd2.madebykontra.com, in `data/kontra-builds.json`.

## Static data sync

The server uses byte-identical copies of some repo data files. After refreshing `data/*.json` or `public/runeword-runes.json`, run from the repo root:

```bash
node server/scripts/sync-static.js
```

The nightly workflow (`.github/workflows/refresh-price-snapshot.yml`) does this itself.

## Documentation

- [`plan/README.md`](plan/README.md): planning hub (vision, roadmap, architecture, decisions, sprints)
- [`CLAUDE.md`](CLAUDE.md): guide for AI agents working in this repo

## Credits and licences

- Character and market data from the official Project Diablo 2 API.
- Parts of the code from [pd2.tools](https://github.com/coleestrin/pd2-tools) by Cole Estrin (MIT).
- Item and skill data from the [PD2 wiki](https://wiki.projectdiablo2.com) (CC BY-SA 4.0).
- Build tiers from the Dark Humility tier list via pd2.madebykontra.com.
- Not affiliated with Project Diablo 2.

Code licence: see [`LICENSE`](LICENSE).
