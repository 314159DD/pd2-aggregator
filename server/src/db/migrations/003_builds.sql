alter table character_items add column inv_code text;
alter table characters add column gear_value_hr numeric(10,2), add column gear_value_partial boolean not null default false,
  add column merc_gear_value_hr numeric(10,2);
create index on characters (season, mode, gear_value_hr);
create index on characters (season, mode, life);
create table item_prices (
  mode text not null check (mode in ('softcore','hardcore')),
  item_type text not null check (item_type in ('Unique','Set','Runeword')),
  item_name text not null,
  median_hr numeric(10,2) not null, samples int not null, source text not null check (source in ('sold','ask')),
  computed_at timestamptz not null,
  primary key (mode, item_type, item_name)
);
create table build_share_daily (
  season int not null, mode text not null, day date not null, class text not null, characters int not null,
  primary key (season, mode, day, class)
);
