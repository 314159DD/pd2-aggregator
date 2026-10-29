# Validation fixtures

Captured responses from our own API (`https://api.pd2meta.info/api/v1`, override with `NEXT_PUBLIC_API_BASE`) for canonical builds (one per class), softcore, minLevel 80 (S14 hardcore pools are too small early in the season). Used by `src/lib/validation/parity.test.ts` and `server/test/meta-parity.test.ts` to verify that the shaping and slot mapping preserve API data without dropping items or corrupting percentages.

Each fixture holds the five stats endpoints plus the `meta` key: the `/meta` response for the same cohort. Parity cases on `meta` are skipped while a fixture has no `meta` key.

## Refreshing

```bash
npx tsx scripts/refresh-validation-fixtures.ts            # fetch and write
npx tsx scripts/refresh-validation-fixtures.ts --dry-run  # print the 7 URLs per build, write nothing
```

Cadence:
- **Weekly** during active development.
- **On every PD2 season patch**: item/skill metadata changes, popular builds shift, `data/item-slots.json` may need a wiki re-scrape.
- **Whenever a parity test starts looking suspicious**: either we have a real bug, or the API behaviour changed.

## Sanity check after refresh

The softcore ladder population for these builds fluctuates across the season cycle and varies between builds. The table is refilled on the next recapture (Task 15 of the phase 3+4 plan); until then the fixtures still hold the old hardcore capture.

| Build | totalSample (softcore, to be filled) |
|---|---|
| barbarian-whirlwind | - |
| amazon-lightning-fury | - |
| assassin-lightning-trapsin | - |
| necromancer-bone-spear | - |
| sorceress-blizzard | - |
| druid-wind-tornado | - |
| paladin-hammerdin | - |

What to look for after refresh:

- **Order-of-magnitude drift**, if `barbarian-whirlwind` drops from 800 to 80, or `paladin-hammerdin` jumps from 8 to 800, something happened upstream worth investigating. New season? API change? Mass build pivot? Note it in a sprint follow-up.
- **Skill filter regression**, if any fixture's `totalSample` suddenly equals the full-class population (e.g., paladin-hammerdin showing thousands), the `skills` query param isn't being sent. That's a 2.1.1-shape regression, block the refresh, file an issue.
- **Empty fixtures**, `totalSample = 0` means the cohort has no qualifying characters. Possible at start-of-season; suspicious otherwise.

The parity tests themselves do not assert specific `totalSample` values, they assert internal consistency (cross-endpoint agreement, item-slot coverage, percentage preservation). Population shifts won't fail the tests; only structural drift will.

## File shape

Each fixture is a single JSON file:

```json
{
  "_meta": {
    "build": "amazon-lightning-fury",
    "fetchedAt": "ISO timestamp",
    "api": "https://api.pd2meta.info/api/v1",
    "season": 14,
    "filter": { "gameMode": "softcore", "className": "Amazon", "minLevel": 80 },
    "skills": [{ "name": "Lightning Fury", "minLevel": 20 }]
  },
  "itemUsage": [...],
  "skillUsage": [...],
  "mercTypeUsage": [...],
  "mercItemUsage": [...],
  "levelDistribution": {...}
}
```
