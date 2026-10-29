import { formatCount } from "@/lib/builds/format";
import type { CharStats } from "@/lib/builds/types";
import { cn } from "@/lib/utils";

type Line = { label: string; value: string; negative?: boolean };

const pct = (n: number) => `${formatCount(n)}%`;
const res = (v: number, max: number): Line["value"] => `${formatCount(v)}/${formatCount(max)}`;

function Group({ title, caption, lines }: { title: string; caption?: string; lines: Line[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
        {title}
        {caption && <span className="font-normal tracking-normal text-muted-ink normal-case">{caption}</span>}
      </h3>
      <dl className="flex flex-col gap-1.5">
        {lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-ink-soft">{l.label}</dt>
            <dd className={cn("font-mono text-sm tabular-nums", l.negative ? "text-danger" : "text-ink")}>{l.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function StatsPanel({ stats, life, mana }: { stats: CharStats | null; life: number | null; mana: number | null }) {
  if (!stats) return <p className="text-sm text-ink-soft">Stats unavailable for this character.</p>;
  const n = (v: number | null) => (v === null ? "-" : formatCount(v));
  const r = (label: string, v: number, max: number): Line => ({ label, value: res(v, max), negative: v < 0 });
  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      <Group
        title="Defensive"
        lines={[
          { label: "Life", value: n(life) },
          { label: "Mana", value: n(mana) },
          { label: "Physical damage reduction", value: pct(stats.physicalDamageReduction) },
        ]}
      />
      <Group
        title="Attributes"
        lines={[
          { label: "Strength", value: n(stats.strength) },
          { label: "Dexterity", value: n(stats.dexterity) },
          { label: "Vitality", value: n(stats.vitality) },
          { label: "Energy", value: n(stats.energy) },
        ]}
      />
      <Group
        title="Resistances"
        lines={[
          r("Fire", stats.fireRes, stats.maxFireRes),
          r("Cold", stats.coldRes, stats.maxColdRes),
          r("Lightning", stats.lightningRes, stats.maxLightningRes),
          r("Poison", stats.poisonRes, stats.maxPoisonRes),
        ]}
      />
      <Group
        title="Absorb"
        caption="flat / %"
        lines={[
          { label: "Fire", value: `${formatCount(stats.fAbsorbFlat)} / ${pct(stats.fAbsorbPct)}` },
          { label: "Cold", value: `${formatCount(stats.cAbsorbFlat)} / ${pct(stats.cAbsorbPct)}` },
          { label: "Lightning", value: `${formatCount(stats.lAbsorbFlat)} / ${pct(stats.lAbsorbPct)}` },
          { label: "Magic", value: formatCount(stats.mAbsorbFlat) },
        ]}
      />
      <Group
        title="Speed"
        caption="Item bonuses only"
        lines={[
          { label: "FCR", value: pct(stats.fasterCastRate) },
          { label: "FHR", value: pct(stats.fasterHitRecovery) },
          { label: "FRW", value: pct(stats.fasterRunWalk) },
          { label: "IAS", value: pct(stats.increasedAttackSpeed) },
        ]}
      />
      <Group
        title="Damage procs"
        lines={[
          { label: "Crushing blow", value: pct(stats.crushingBlow) },
          { label: "Deadly strike", value: pct(stats.deadlyStrike) },
          { label: "Open wounds", value: pct(stats.openWounds) },
          { label: "Critical strike", value: pct(stats.criticalStrike) },
        ]}
      />
      <Group
        title="Leech"
        lines={[
          { label: "Life leech", value: pct(stats.lifeLeech) },
          { label: "Mana leech", value: pct(stats.manaLeech) },
          { label: "Life per kill", value: formatCount(stats.hpPerKill) },
          { label: "Mana per kill", value: formatCount(stats.mpPerKill) },
        ]}
      />
    </div>
  );
}
