-- Stack quantity of a listing (50 for an orb stack, 1 for single items). A drop on a live
-- listing is a partial sale of a bulk listing and accumulates in qty_dropped.
alter table market_listings add column quantity int;
alter table market_listings add column first_quantity int;
alter table market_listings add column qty_dropped int not null default 0;
