# Handoff: /barb gold calculator and orb market demand

Written 2026-10-29. Resume here in a few days (target: on or after 2026-11-05).

## What is live

- **https://www.pd2meta.info/barb**: Gold Find Barb calculator (gold per hour, best gold to WSS route, RNG range, market prices). Not linked in the header nav yet, guildies get the direct link.
- **Market demand card** on the same page, fed by `GET https://api.pd2meta.info/api/v1/market/demand?items=Zakarum Orb,Horadrim Orb&gameMode=softcore&days=7`.
- main is at `bafd366` (last change: dropped the yellow "market buys everything" warning, demand notes in `text-sm`).

## What runs by itself (nothing to do)

The collector on the VPS (`/opt/pd2meta`, see `deploy/RUNBOOK.md`) already does all of it:
- `market-poll` every 75 s picks up new listings and stack quantity changes (partial sales on one listing count as `qty_dropped`).
- `market-full-sweep` every 6 h marks listings that disappeared as gone. Gone counts only move after a full sweep.
- The collector pauses daily 12:00 to 14:00 (`PD2_PAUSE_*`).
- Tracking started 2026-10-29 00:22 UTC. The card shows a "not reliable yet" warning until 7 days of data exist.

State at handoff (21:20 UTC): Zakarum 22 open listings / 267 orbs, Horadrim 26 / 320, nothing gone yet.

## Next session: read the first real week

1. `curl "https://api.pd2meta.info/api/v1/market/demand?items=Zakarum%20Orb,Horadrim%20Orb&gameMode=softcore&days=7"`
2. For detail (per listing price, hours listed, gone time), query `market_listings` on the VPS Postgres via `vps_ssh.py` as in the runbook. Columns added by migration `003_market_quantity.sql`: `quantity`, `first_quantity`, `qty_dropped`.
3. Report to Steven: stacks/orbs gone per week, median hours listed, and how many farm hours that equals (the card shows this too).

## Open points

- **Stack sizes:** 267 orbs over 22 Zakarum listings is about 12 per listing, so not every listing is a 50 stack as assumed earlier. The calculator still prices routes with a 50 stack (`GOLD_DEFAULTS.zStack` in `src/lib/barb/gold.ts`). Check the real mix before changing anything; the per orb gold price is what matters for the route math, the stack size only matters for buying in bulk.
- Disappeared listings are not always sales (deleted/expired), and in-game trades are invisible. The card says so; treat demand as a lower bound.
- Possible follow-ups (not asked for yet): /barb in the header nav; cap WSS/h by market absorption once data exists; hardcore toggle on the demand card (it is softcore only); delete or update the stale standalone `../pd2-gold-calc/index.html` (old LEXADIS light version with outdated numbers).

## Rules that apply here

- pd2meta keeps the dark D2 look (Cinzel, gold on brown), not LEXADIS.
- No em dashes in user facing copy.
- Branch, merge to main, push; Vercel deploys the web on push. Server changes need the tar deploy from `deploy/RUNBOOK.md`.
- Gates: `npm test`, `npm run typecheck`, `npx eslint`, `npm run build` (web); `server/`: `npx tsc --noEmit` and its vitest suite.
