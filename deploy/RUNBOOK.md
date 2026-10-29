# pd2meta server runbook

Collector, read API and Postgres run on the VPS `76.13.140.109` as the compose project `pd2meta` in `/opt/pd2meta`. Public URL: `https://api.pd2meta.info/api/v1` (host nginx, Let's Encrypt via certbot). DNS: `A api.pd2meta.info -> 76.13.140.109` on Vercel DNS (scope `stevens-projects-660c4037`).

Layout on the VPS:

```
/opt/pd2meta/server/   source (from git archive)
/opt/pd2meta/deploy/   docker-compose.yml, nginx config, this file
/opt/pd2meta/deploy/.env   POSTGRES_PASSWORD plus optional overrides (never committed)
```

## Deploy / update

From the repo root on the dev machine (Git Bash):

```
git archive --format=tar.gz -o /tmp/pd2meta.tar.gz HEAD server deploy
MSYS_NO_PATHCONV=1 python ../vps_ssh.py put /tmp/pd2meta.tar.gz /tmp/pd2meta.tar.gz
python ../vps_ssh.py 'mkdir -p /opt/pd2meta && tar -xzf /tmp/pd2meta.tar.gz -C /opt/pd2meta && cd /opt/pd2meta/deploy && docker compose up -d --build'
```

First deploy only:

```
cd /opt/pd2meta/deploy
printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env && chmod 600 .env
cp nginx-api.pd2meta.info.conf /etc/nginx/sites-available/api.pd2meta.info
ln -s /etc/nginx/sites-available/api.pd2meta.info /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.pd2meta.info --non-interactive --agree-tos --redirect -m <owner email>
```

### Phase 2 (Builds tab) deploy

1. Deploy the server first (steps above), then the web app. The new web build calls the `/builds/*` endpoints, which must exist before it goes live.
2. Wait until the collector has logged its first price job: `docker compose -p pd2meta logs collector | grep "price job:"`.
3. Only then run the item backfill:

```
docker compose -p pd2meta exec -T api node dist/scripts/backfill-items.js
```

4. If it reports skipped characters, run it again until none are skipped.
5. Watch `docker stats` in a second shell while it runs (memory and CPU of `api` and `db`).

### Meta rollup (migration 005) deploy

Migration 005 creates `meta_rollup` empty and marks it not ready, so `/meta` keeps the old per-character queries until the rollup is built. Right after the server deploy:

```
docker compose -p pd2meta exec -T db psql -U pd2meta -d pd2meta -c "update collector_control set paused = true"
docker compose -p pd2meta exec -T api node dist/scripts/backfill-meta.js
docker compose -p pd2meta exec -T db psql -U pd2meta -d pd2meta -c "update collector_control set paused = false"
docker compose -p pd2meta restart api   # drops meta results cached while the rollup was not ready
```

The rebuild runs in one transaction and holds the rollup lock (about 30 to 60 s at 6k characters); a running collector's upserts would wait on it and fail on their 15 s statement timeout, so `backfill-meta` refuses to start unless the collector is paused (`--force` overrides). It is idempotent.

Run it again (same steps) after any deploy that changes the meta fact code (`src/db/meta-rollup.ts`, the static prereq/slot data): the api then logs `meta rollup fingerprint mismatch, run backfill-meta` once and serves `/meta` from the per-character queries until the rebuild.

### Usage indexes (migration 008) deploy

`/builds/usage` and `/characters/stats/*` read `meta_rollup` for base cohorts (season, mode, classes, level window); cohorts with an item, skill, merc or gear filter still query `character_items` and `character_skills`, and migration 008 adds covering indexes for them. A plain `create index` inside the migration would block writes (collector, archive import) for the whole build, so on the live database build them first, one at a time, before deploying the server:

```
docker compose -p pd2meta exec -T db psql -U pd2meta -d pd2meta -c "create index concurrently if not exists character_items_owner_name_char_idx on character_items (owner, name, character_id)"
docker compose -p pd2meta exec -T db psql -U pd2meta -d pd2meta -c "create index concurrently if not exists character_items_usage_idx on character_items (character_id, owner) include (name, quality, is_runeword, inv_code) where is_runeword or quality in ('Unique', 'Set')"
docker compose -p pd2meta exec -T db psql -U pd2meta -d pd2meta -c "create index concurrently if not exists character_skills_skill_level_char_idx on character_skills (skill, hard_level) include (character_id)"
docker compose -p pd2meta exec -T db psql -U pd2meta -d pd2meta -c "create index concurrently if not exists character_skills_at20_idx on character_skills (character_id) include (skill) where hard_level >= 20"
docker compose -p pd2meta exec -T db psql -U pd2meta -d pd2meta -c "select c.relname, i.indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname in ('character_items_owner_name_char_idx', 'character_items_usage_idx', 'character_skills_skill_level_char_idx', 'character_skills_at20_idx')"
```

All four must show `indisvalid = t`. A concurrent build that fails leaves an invalid index under the name, and the migration's `if not exists` would then skip it: `drop index concurrently <name>` and build it again. Then deploy; migration 008 finds the indexes and does nothing. Afterwards the old `character_items_owner_name_idx` and `character_skills_skill_hard_level_idx` are prefixes of the new ones and can go: `drop index concurrently character_items_owner_name_idx` and `drop index concurrently character_skills_skill_hard_level_idx`.

### Archive import: slow page writes

If the page write p95 of the archive importer goes above 5,000 ms, stop the importer container (`docker stop pd2meta-archive`) and resume later off-peak; it is resumable, rerun the same command. Do not use `--no-rollup` as a fallback for slow writes. It marks the global rollup not ready, which sends `/builds/usage`, `/characters/stats/*` and `/meta` back to the slow per-character queries for every season until `backfill-meta` has run.

## Check

```
curl -s https://api.pd2meta.info/api/v1/health      # {"status":"ok"}
curl -s https://api.pd2meta.info/api/v1/stats       # counts, collector heartbeat
docker compose -p pd2meta logs --tail 100 collector
docker stats --no-stream
```

## Pause the collector (no redeploy)

```
docker compose -p pd2meta exec -T db psql -U pd2meta -d pd2meta -c "update collector_control set paused = true"
```

Resume with `paused = false`. The heartbeat keeps running while paused. Hard stop: set `COLLECTOR_ENABLED=false` in `.env` and `docker compose up -d collector`.

## Upstream etiquette

At most one request per second to `api.projectdiablo2.com`, nothing between 12:00 and 14:00 America/Los_Angeles. The PD2 team OK'd this on their Discord (2026-10-28) as long as usage stays respectful. Do not raise the rate.

## Backup

```
docker compose -p pd2meta exec -T db pg_dump -U pd2meta -Fc pd2meta > /opt/_backups/pd2meta-$(date +%F).dump
```
