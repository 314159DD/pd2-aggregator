# Session-Ritual Skills

Two slash commands tailored to the PD2 `plan/` workflow.

| Command | What it does | Source |
|---------|--------------|--------|
| `/orient` | Reads `CLAUDE.md` + `plan/roadmap.md` + active sprint/task + git state, summarizes in <15 lines. Pass a sprint number (`/orient 2.1`), task ID (`/orient task-007`), or nothing for general overview. | [`../../.claude/skills/orient/SKILL.md`](../../.claude/skills/orient/SKILL.md) |
| `/wrap` | Scans the conversation for capture-worthy drops, proposes targeted writes (sprint file, roadmap, decisions, tasks, MEMORY.md, architecture, providers), writes only after confirmation. | [`../../.claude/skills/wrap/SKILL.md`](../../.claude/skills/wrap/SKILL.md) |

## Where they live and why

The actual skill files are at `.claude/skills/<name>/SKILL.md` — that's where Claude Code discovers project-local skills. This folder is just the index so the skills are visible from `plan/` (the single source of truth for project meta).

## Editing

Edit the SKILL.md files directly. They are the canonical version. After editing, start a new Claude Code session for the changes to be picked up.
