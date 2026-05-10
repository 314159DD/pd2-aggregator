# plan/ — PD2 Aggregator Documentation Hub

**Updated:** 2026-05-10

This folder is the **single source of truth** for the PD2 Build Affix Aggregator. A new contributor (or future-you) should be able to open this folder and understand what's being built, what's shipped, and what's next — without reading code.

## Where to Find Things

| Need | Read |
|------|------|
| What are we building and why? | [PRODUCT_VISION.md](PRODUCT_VISION.md) |
| Current phase + what's next | [roadmap.md](roadmap.md) |
| Tech choices and rationale | [techstack.md](techstack.md) |
| How a component works | [architecture/](architecture/) |
| Why a decision was made | [decisions/](decisions/) |
| External services & APIs | [providers/](providers/) |
| Research findings | [research/](research/) |
| Sprint overview (macro) | [sprints/](sprints/) |
| Individual tickets (micro) | [tasks/](tasks/) |
| Session-ritual slash commands | [skills/](skills/) (`/orient`, `/wrap`) |
| Superseded docs | [archive/](archive/) |

## Folder Structure

```
plan/
├── README.md              ← you are here
├── PRODUCT_VISION.md      # Vision, audience, core features, success criteria
├── roadmap.md             # Feature table + phase summaries
├── techstack.md           # Stack + key tech decisions
│
├── architecture/          # One doc per major component
├── decisions/             # Architectural Decision Records
├── providers/             # External services, APIs, dependencies
├── research/              # Research briefs, results, corrections
│
├── sprints/               # Macro: one file per sprint
│   ├── _TEMPLATE.md
│   └── archive/           # Completed sprint files
│
├── tasks/                 # Micro: one file per ticket
│   ├── _TEMPLATE.md
│   └── archive/
│
├── skills/                # Index of project-local slash commands
│                          # (real skill files at ../.claude/skills/<name>/SKILL.md)
│
└── archive/               # Superseded docs
```

## Why no DELIVERABLES.md?

This is a community tool, not client work. There's no contract, no acceptance criteria, no client to sign off. The template's `DELIVERABLES.md` was dropped per its own guidance ("drop for non-client work").

## sprints/ vs tasks/

- **`sprints/`** — macro. One file per sprint. Goal, context, inline task list, done-when. The "what's this sprint shipping?" view.
- **`tasks/`** — micro. GitHub-ticket-style. One file per item that earns its own page — detailed spec, investigation, open questions.

Start items inline in the sprint file. Promote to `tasks/` only when an item outgrows its bullet or needs a life beyond one sprint.

## Rules

- **One source per concept** — no duplicate tables across files. Link instead.
- **Archive, don't delete** — superseded docs go to `archive/`, not the trash.
- **Scaffold only what's used** — empty folders are fine.
- **Keep roadmap lean** — details live in sprint files, not the roadmap.

## Open structural questions

- [ ] Should the existing `docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md` and `docs/decisions/2026-05-08-pd2-tools-license.md` move into `plan/architecture/` and `plan/decisions/` for true single-source-of-truth? Currently they're linked from here, not moved.
