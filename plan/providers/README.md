# Providers — External Dependencies

**Updated:** 2026-05-10

External services, APIs, and third-party dependencies the project relies on.

## Provider Matrix

| Provider | Type | Status | Cost | Doc |
|----------|------|--------|------|-----|
| api.pd2.tools | Public REST API | Active — **critical** | Free | [pd2-tools-api.md](pd2-tools-api.md) |
| pd2.wiki (Special:FilePath) | Static asset CDN | Active | Free | (one-liner — see below) |
| Vercel | Static hosting | Active | Free tier | (one-liner — see below) |
| GitHub | Source hosting | Active | Free | (one-liner — see below) |

### One-liner providers

- **pd2.wiki** — used for skill icons via `Special:FilePath` redirect (see commit `8cc9c4e`). No auth, no cost. Fallback: skills render without an icon.
- **Vercel** — static export hosting at `pd2-aggregator.vercel.app`. Free tier ceiling is comfortably above any plausible community traffic. No deploy hooks or backend functions in use.
- **GitHub** — source hosting. No CI/CD wired yet (snapshot refresh is manual). When snapshot automation lands, it'll likely live as a GitHub Actions workflow.

## Credentials

None. Every provider is unauthenticated public access.

## Rate Limits & Quotas

| Provider | Limit | Consequence |
|----------|-------|-------------|
| api.pd2.tools | Unknown — courtesy use only | Snapshot fallback exists; should contact maintainer if traffic grows |
| Vercel free tier | 100 GB bandwidth/mo, 100 GB-hr functions | Static export only → bandwidth is the only meter that matters; ~10k community even at 100% adoption is well inside |
| pd2.wiki | Unknown | Asset failures degrade gracefully (no icon shown) |
| GitHub | Standard | Repo size matters if `data/snapshot.json` keeps growing |
