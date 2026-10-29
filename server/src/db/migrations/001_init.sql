create table characters (
  id bigserial primary key,
  season int not null,
  mode text not null check (mode in ('softcore','hardcore')),
  name text not null,
  account text,
  class text not null,
  level int not null,
  experience bigint not null,
  life int, mana int,
  attributes jsonb not null default '{}',
  guild text,
  is_dead boolean not null default false,
  source text not null default 'live' check (source in ('live','archive')),
  raw bytea not null,
  first_seen_at timestamptz not null default now(),
  last_ingested_at timestamptz not null,
  unique (season, mode, name)
);
create index on characters (season, mode, class, level);
create index on characters (lower(account));
create index on characters (lower(name));
create table character_skills (
  character_id bigint not null references characters(id) on delete cascade,
  skill text not null, hard_level int not null, real_level int,
  primary key (character_id, skill)
);
create index on character_skills (skill, hard_level);
create table character_items (
  id bigserial primary key,
  character_id bigint not null references characters(id) on delete cascade,
  owner text not null check (owner in ('player','merc')),
  slot text, is_switch boolean not null default false, is_charm boolean not null default false,
  name text not null, quality text not null, base_name text, base_type text,
  is_runeword boolean not null default false, mods jsonb not null default '[]'
);
create index on character_items (character_id);
create index on character_items (owner, name);
create table character_merc (character_id bigint primary key references characters(id) on delete cascade, description text not null);
create table character_history (character_id bigint not null references characters(id) on delete cascade, ts timestamptz not null, level int not null, experience bigint not null, primary key (character_id, ts));
create table accounts_seen (account text primary key, last_checked_at timestamptz not null);
create table priority_accounts (account text primary key, requested_at timestamptz not null default now(), requested_ip text);
create table market_listings (
  id text primary key, item_name text, quality text, base_name text, runeword_key text,
  is_corrupted boolean not null default false, is_ladder boolean not null, is_hardcore boolean not null,
  price_text text, price_hr numeric(10,3), created_at timestamptz, bumped_at timestamptz,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), gone_at timestamptz
);
create index on market_listings (item_name, is_ladder, is_hardcore) where gone_at is null;
create table collector_status (id int primary key default 1 check (id = 1), heartbeat_at timestamptz, stats jsonb not null default '{}');
create table collector_control (id int primary key default 1 check (id = 1), paused boolean not null default false);
insert into collector_status (id) values (1);
insert into collector_control (id) values (1);
