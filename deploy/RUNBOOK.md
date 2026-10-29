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
