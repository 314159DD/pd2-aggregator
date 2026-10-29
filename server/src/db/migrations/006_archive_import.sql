-- Progress of the archive import (S11-S13 from api.pd2.tools), one row per (season, mode, pass).
-- A page's rows and its progress row commit together (src/archive/write.ts).
create table archive_import_progress (
  season int not null,
  mode text not null check (mode in ('softcore','hardcore')),
  pass int not null,
  next_page int not null default 1,
  upstream_total int,
  received int not null default 0,
  inserted int not null default 0,
  existing int not null default 0,
  below_min int not null default 0,
  invalid int not null default 0,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (season, mode, pass)
);
