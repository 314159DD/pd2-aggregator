# Validation fixtures

Captured `api.pd2.tools` responses for canonical builds (one per class). Used by `src/lib/validation/parity.test.ts` to verify our shaping / slot-mapping preserves API data without dropping items or corrupting percentages.

## Refreshing

```bash
npx tsx scripts/refresh-validation-fixtures.ts
```

Cadence:
- **Weekly** during active development.
- **On every PD2 season patch** — item/skill metadata changes, popular builds shift, `data/item-slots.json` may need a wiki re-scrape.
- **Whenever a parity test starts looking suspicious** — either we have a real bug, or the upstream API behavior changed.

## Sanity check after refresh

The HC ladder population for these builds fluctuates significantly across the season cycle and varies wildly between builds. Below are the `totalSample` values observed at fixture-generation time (2026-05-11). Use these as a baseline:

| Build | totalSample (2026-05-11) |
|---|---|
| barbarian-whirlwind | 832 |
| amazon-lightning-fury | 97 |
| assassin-lightning-trapsin | 88 |
| necromancer-bone-spear | 74 |
| sorceress-blizzard | 65 |
| druid-wind-tornado | 49 |
| paladin-hammerdin | 8 |

What to look for after refresh:

- **Order-of-magnitude drift** — if `barbarian-whirlwind` drops from 800 to 80, or `paladin-hammerdin` jumps from 8 to 800, something happened upstream worth investigating. New season? API change? Mass build pivot? Note it in a sprint follow-up.
- **Skill filter regression** — if any fixture's `totalSample` suddenly equals the full-class population (e.g., paladin-hammerdin showing thousands), the `skills` query param isn't being sent. That's a 2.1.1-shape regression — block the refresh, file an issue.
- **Empty fixtures** — `totalSample = 0` means the cohort has no qualifying characters. Possible at start-of-season; suspicious otherwise.

The parity tests themselves do not assert specific `totalSample` values — they assert internal consistency (cross-endpoint agreement, item-slot coverage, percentage preservation). Population shifts won't fail the tests; only structural drift will.

## File shape

Each fixture is a single JSON file:

```json
{
  "_meta": {
    "build": "amazon-lightning-fury",
    "fetchedAt": "ISO timestamp",
    "filter": { "gameMode": "hardcore", "className": "Amazon", "minLevel": 80 },
    "skills": [{ "name": "Lightning Fury", "minLevel": 20 }]
  },
  "itemUsage": [...],
  "skillUsage": [...],
  "mercTypeUsage": [...],
  "mercItemUsage": [...],
  "levelDistribution": {...}
}
```
