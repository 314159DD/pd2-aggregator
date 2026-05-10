---
name: wrap
description: Capture what's worth keeping — sprint progress, decisions, follow-ups, cross-session insights. Mid-session drop or end-of-session recap. Propose first; never write without confirmation.
---

When Steven types `/wrap` (or end-of-session signals trigger): scan the conversation since the last wrap (or session start) for capture-worthy items. Propose → confirm → write. **No write without confirmation.**

## The Bar (high — empty wrap beats pollution)

### Worth capturing

- **Sprint progress** — a task moved to `in_progress` / `completed` / `blocked` and the sprint file doesn't reflect it yet
- **Sprint completion** — sprint closed, earns roadmap mark-done + date + `CLAUDE.md` status line refresh + Sprint Close Checklist
- **Decision with rationale** — non-trivial choice that should survive in `plan/decisions/` (alternatives considered, why this won, when to revisit)
- **Substantial follow-up** — discovered work that needs its own `plan/tasks/` ticket: detailed spec, cross-sprint life, or substantial investigation. Three lines of inline notes? Stay in the sprint file. Half a page of context? Promote to a task.
- **Cross-session insight** — user preference, gotcha, lesson worth carrying into future sessions/projects → user `MEMORY.md`
- **Architectural insight** — component behavior, data-flow quirk, or constraint worth documenting in `plan/architecture/`
- **Provider gotcha** — new behavior of `api.pd2.tools` (rate limit, payload change, breaking response shape) → `plan/providers/pd2-tools-api.md` Gotchas section

### Not worth capturing — anti-pollution guard

- Routine code edits → already in git, commit message carries the why
- Bug fix details → already in the commit
- Conversational status without new insight → drop
- "What's next" thoughts that'll change tomorrow → drop
- Repetition of something already documented → **extend the existing doc**, don't write a new one
- Things that just feel "nice to remember" but have no clear reuse → drop
- **When unsure: don't write.** Empty wrap is fine.

## Modes (self-detected, not two commands)

- **Mid-session drop** — one focused capture, conversation continues; terse, back-to-work
- **End-of-session recap** — full sweep across all targets; if a sprint completed, offer the Sprint Close Checklist

## Targets

| Captured item | Goes to |
|---|---|
| Task status change | task block in `plan/sprints/sprint-X.Y-*.md` |
| Sprint completed | `plan/roadmap.md` (mark done + date) + `CLAUDE.md` Status line + Sprint Close Checklist |
| Promoted task (new) | new `plan/tasks/task-NNN-*.md` from `_TEMPLATE.md` |
| Decision + rationale | new `plan/decisions/YYYY-MM-DD-*.md` from `_TEMPLATE.md` + add row to `plan/decisions/README.md` index |
| Cross-session user/preference insight | user `MEMORY.md` at `C:\Users\tek\.claude\projects\C--Coding-III----Full-Circle\memory\` |
| Component / data-flow insight | extend `plan/architecture/<component>.md` if exists, else create from `_TEMPLATE.md` and add to `plan/architecture/README.md` index |
| Provider gotcha | `plan/providers/pd2-tools-api.md` Gotchas |

## Procedure

1. **Scan** conversation since last wrap / session start
2. **Filter** against the anti-pollution guard above
3. **Classify** surviving items by target table
4. **Propose** to Steven: concrete file paths + a one-line hook per proposed write. If nothing survives the bar: say so honestly — "no capture-worthy drops this session."
5. **Steven confirms or skips individual items.** No write without confirmation.
6. **Write** following the existing pattern of each target file (frontmatter where it exists, links to sibling docs, terse).
7. **If end-of-session AND a sprint completed:** offer to run the Sprint Close Checklist from `CLAUDE.md` (mark tasks completed, update roadmap, refresh CLAUDE.md status, move sprint to `archive/`, move resolved tickets to `tasks/archive/`, merge branch).
8. **Confirm** what was written, with full paths.

## Auto-trigger (proactive suggestion)

End-of-session signals → proactively offer `/wrap`:

> "that's it for today" · "thanks, I'm done" · "later" · "tomorrow" · "going to bed" · "new chat" · "wrapping up" · "ok bin durch"

When a trigger fires: short "N capture-worthy drops detected — run `/wrap`?" with a one-line preview per drop.
**If no capture-worthy drops: don't suggest.** No "want to wrap?" when the answer is "nothing there."

## Golden path

Steven drops something worth keeping → you notice or Steven types `/wrap` → you propose concrete writes → Steven nods or skips → you write (terse, focused) → confirm paths → back to work.

Low friction. No note without a drop. No drop without capture.
