-- Meta aggregates per (season, mode, class, level), maintained by upsertCharacter and backfillItems
-- (src/db/meta-rollup.ts). Base cohorts (no skill filter) sum these rows instead of expanding
-- character_items.mods. kind/k1/k2/k3/val are the aggregation keys of one fact kind; n, total and
-- entries are sums over the contributing per-character facts (entries = number of facts, the row
-- is deleted when it reaches 0).
create table meta_rollup (
  season int not null,
  mode text not null,
  class text not null,
  level int not null,
  kind text not null,
  k1 text,
  k2 text,
  k3 text,
  val float8,
  n int not null,
  total numeric,
  entries int not null,
  constraint meta_rollup_key unique nulls not distinct (season, mode, class, level, kind, k1, k2, k3, val)
) with (fillfactor = 80); -- room for HOT updates: upserts change n/total/entries in place
-- Cohort reads: one kind of one season and mode over a level range, optionally some classes.
create index meta_rollup_cohort on meta_rollup (season, mode, kind, level, class);

-- ready = the rollup reflects every stored character. On an empty database it is trivially
-- complete; on a populated one it stays false until scripts/backfill-meta.ts has rebuilt it,
-- and /meta keeps using the per-character queries until then.
-- fingerprint = META_FACTS_FINGERPRINT of the code that built it (null: nothing written yet);
-- /meta ignores a rollup stamped by other fact code until the next backfill-meta.
create table meta_rollup_status (
  id int primary key default 1 check (id = 1), ready boolean not null, fingerprint text
);
insert into meta_rollup_status (id, ready) select 1, not exists (select 1 from characters);
