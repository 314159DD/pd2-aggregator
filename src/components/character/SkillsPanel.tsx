import { SkillIcon } from "@/components/builds/ItemIcon";

type Real = { skill: string; level: number; baseLevel?: number };
type Hard = { name: string; level: number };

const MIN_SCALE = 20;

/** Real level (items included) first, hard points as the solid part of the bar. Zero-level skills are hidden. */
export function SkillsPanel({ realSkills, skills }: { realSkills?: Real[]; skills: Hard[] }) {
  const real = new Map((realSkills ?? []).map((r) => [r.skill, r.level]));
  const hard = new Map(skills.map((s) => [s.name, s.level]));
  const rows = [...new Set([...hard.keys(), ...real.keys()])]
    .map((name) => {
      const h = hard.get(name) ?? 0;
      return { name, hard: h, real: real.get(name) ?? h };
    })
    .filter((r) => r.real > 0)
    .sort((a, b) => b.real - a.real || a.name.localeCompare(b.name));
  const max = Math.max(MIN_SCALE, ...rows.map((r) => r.real));

  if (rows.length === 0) return <p className="text-sm text-ink-soft">No skills.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const hardPct = Math.min(100, (r.hard / max) * 100);
        const bonusPct = Math.min(100 - hardPct, (Math.max(0, r.real - r.hard) / max) * 100);
        return (
          <li key={r.name} data-testid="skill-row" className="flex min-w-0 items-center gap-2.5">
            <SkillIcon name={r.name} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span title={r.name} className="truncate text-sm text-ink">
                {r.name}
              </span>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-well" aria-hidden>
                <div className="h-full" style={{ width: `${hardPct}%`, background: "var(--glow)" }} />
                <div className="h-full" style={{ width: `${bonusPct}%`, background: "color-mix(in oklab, var(--glow) 40%, transparent)" }} />
              </div>
            </div>
            <span className="shrink-0 font-mono text-sm text-ink tabular-nums">
              {r.real}
              {r.real !== r.hard && <span className="ml-1 text-xs text-ink-soft">({r.hard})</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
