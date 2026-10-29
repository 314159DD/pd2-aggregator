-- Names repeated within one upstream page are written once; count them so
-- received = inserted + existing + below_min + invalid + dupes.
alter table archive_import_progress add column dupes int not null default 0;
