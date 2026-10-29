-- Covering indexes for the per-character usage queries of filtered cohorts (/builds/usage,
-- /characters/stats/* with item, skill or merc filters). Base cohorts read meta_rollup instead.
--
-- On a populated database build them first with `create index concurrently` under the same
-- names (deploy/RUNBOOK.md, "Usage indexes (migration 008)"); this migration then finds them and
-- does nothing. On a fresh or small database it builds them here.

-- Item filter (`exists ... owner = $ and name = $`): character ids straight from the index,
-- without a heap visit per matching item.
create index if not exists character_items_owner_name_char_idx on character_items (owner, name, character_id);

-- Item usage of the filtered characters: Unique, Set and Runeword rows only, index-only.
create index if not exists character_items_usage_idx on character_items (character_id, owner)
  include (name, quality, is_runeword, inv_code)
  where is_runeword or quality in ('Unique', 'Set');

-- Skill filter (`exists ... skill = $ and hard_level >= $`): character ids from the index.
create index if not exists character_skills_skill_level_char_idx on character_skills (skill, hard_level) include (character_id);

-- Skill usage (hard_level >= 20) of the filtered characters, index-only.
create index if not exists character_skills_at20_idx on character_skills (character_id) include (skill) where hard_level >= 20;
