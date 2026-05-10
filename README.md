# PD2 Build Affix Aggregator

Aggregates Project Diablo 2 ladder builds from the [pd2.tools](https://pd2.tools) public API and surfaces what gear, affixes, and charms top players actually use for a given class + skills filter. Live at **https://pd2-aggregator.vercel.app**.

The use case: PD2 has very few written build guides, especially for off-meta builds. Players who want to know "what affixes should I roll on my Phoenix Strike Assassin's amulet?" can now pull the answer directly from what the ladder is doing.

## Quick start

```bash
git clone https://github.com/314159DD/pd2-aggregator.git
cd pd2-aggregator
npm install
npm run dev
# open http://localhost:3000
```

Other commands:
- `npm test` — run the test suite (vitest)
- `npm run typecheck` — TypeScript check
- `npm run build` — static export to `out/`

## Documentation

- [`plan/README.md`](plan/README.md) — full planning hub (vision, roadmap, architecture, decisions, providers, sprints)
- [`docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`](docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md) — original architecture doc
- [`CLAUDE.md`](CLAUDE.md) — guide for AI agents working in this repo

## Data sources

- **[pd2.tools](https://pd2.tools)** by [@coleestrin](https://github.com/coleestrin) — the ladder data source (public REST API). Without their work, this project doesn't exist.
- **[wiki.projectdiablo2.com](https://wiki.projectdiablo2.com)** — skill prereqs/synergies and item metadata. Content is CC-BY-SA; we link back to the wiki in-app.
- **[coleestrin/pd2-tools](https://github.com/coleestrin/pd2-tools)** — affix mod dictionary (MIT-licensed, copied with attribution).

## Stack

Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind 4, shadcn/ui, vitest. No backend — the browser talks to api.pd2.tools directly. Aggregation runs in a Web Worker; cache lives in IndexedDB.

## Contributing

Issues and PRs welcome. The current sprint and roadmap live in [`plan/`](plan/). Test suite must stay green (`npm test`) and types must check (`npm run typecheck`).

## License

[MIT](LICENSE).
