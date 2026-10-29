alter table item_prices drop constraint item_prices_item_type_check;
alter table item_prices add constraint item_prices_item_type_check check (item_type in ('Unique','Set','Runeword','Rune'));
