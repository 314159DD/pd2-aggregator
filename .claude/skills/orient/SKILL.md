---
name: orient
description: Bring Claude up to speed on PD2 for a new session. Pass a sprint number (/orient 2.1), a task ID (/orient task-007), or nothing for general overview.
---

You are starting a fresh session in the PD2 Build Affix Aggregator (`C:\Coding\III____Full_Circle\PD2`). Run the open ritual to get productive in under 30 seconds. Do steps in parallel where possible.

## Always (every orient)

1. Read `CLAUDE.md` — status line, plan/ pointer table, gotchas
2. Read `plan/README.md` — navigation hub
3. Read `plan/roadmap.md` — current phase + active/next sprint
4. Run `git -C "C:/Coding/III____Full_Circle/PD2" log --oneline -10` — recent commits
5. Run `git -C "C:/Coding/III____Full_Circle/PD2" status -sb` — working-tree state

## If $ARGUMENTS is a sprint number (e.g. "2.1")

6. Read `plan/sprints/sprint-$ARGUMENTS-*.md` — sprint goal + task list
7. For every task in that sprint that has its own ticket, read `plan/tasks/task-NNN-*.md`

## If $ARGUMENTS starts with "task-"

6. Read `plan/tasks/$ARGUMENTS-*.md` — full ticket
7. Read the parent sprint file linked in the ticket

## If $ARGUMENTS is empty or "general"

6. List `plan/sprints/*.md` at top level (skip `archive/`) — open sprints
7. List `plan/tasks/*.md` at top level (skip `archive/`) — open tickets
8. Skim the **Open Questions** section of `plan/PRODUCT_VISION.md` — anything outstanding

## After reads complete, summarize

Be terse — bullet list, not prose:

- **Status** — from `CLAUDE.md` status line, one line
- **Active sprint** — number, goal, tasks with status flags (✓ done / → in_progress / · pending / ✗ blocked)
- **Recent commits** — last 3, one line each
- **Git state** — `clean` or list of dirty files
- **Open questions / blockers** in scope of `$ARGUMENTS`, if any
- **Suggested first action** — one sentence

If `$ARGUMENTS` was a sprint or task: also flag whether it's the same scope as the most recent commits (we may have drifted).

The goal is "productive in 30 seconds." If you can't summarize in under ~15 lines, you've over-read.
