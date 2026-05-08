/**
 * build-mod-dictionary.ts
 *
 * Builds data/mod-dictionary.json from pattern-based classification of all
 * mod IDs seen in data/snapshot.json. Merges data/mod-dictionary.overrides.json
 * on top (manual fixes take priority).
 *
 * Usage: npx tsx scripts/build-mod-dictionary.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

type Category =
  | "skill"
  | "resist"
  | "stat"
  | "damage"
  | "speed"
  | "leech"
  | "utility"
  | "defense"
  | "proc"
  | "other";

type DictEntry = {
  category: Category;
  displayLabel: string; // stable grouping label (not the per-item-rendered one)
};

// ─── Pattern-based classifier ───────────────────────────────────────────────
// Each entry: [regex, category, labelFn(modName) => string]
// First match wins, so order matters.
type PatternRow = [RegExp, Category, (name: string) => string];

const PATTERNS: PatternRow[] = [
  // ── Skills ──────────────────────────────────────────────────────────────
  [/^item_addskill_tab$/, "skill", () => "+X to Skill Tab"],
  [/^item_addclassskills$/, "skill", () => "+X to All Class Skills"],
  [/^item_allskills$/, "skill", () => "+X to All Skills"],
  [/^item_singleskill$/, "skill", () => "+X to Specific Skill"],
  [/^item_nonclassskill$/, "skill", () => "+X to Non-Class Skill"],
  [/^item_elemskill_(cold|fire|lightning|poison|magic)$/, "skill", (n) => {
    const e = n.replace(/^item_elemskill_/, "");
    return `+X to ${e[0].toUpperCase()}${e.slice(1)} Skills`;
  }],
  [/^item_aura$/, "skill", () => "Aura When Equipped"],
  [/^item_charged_skill$/, "skill", () => "Charged Skill"],
  [/^item_skillonattack$/, "proc", () => "Proc On Attack"],
  [/^item_skillonhit$/, "proc", () => "Proc On Hit"],
  [/^item_skillongethit$/, "proc", () => "Proc On Getting Hit"],
  [/^item_skilloncast$/, "proc", () => "Proc On Cast"],
  [/^item_skillonkill$/, "proc", () => "Proc On Kill"],
  [/^item_skillondeath$/, "proc", () => "Proc On Death"],
  [/^item_skillonblock$/, "proc", () => "Proc On Block"],
  [/^item_skillonequip$/, "proc", () => "Proc On Equip"],
  [/^item_skillonlevelup$/, "proc", () => "Proc On Level Up"],
  [/^item_reanimate$/, "proc", () => "Reanimate As"],

  // ── Resistances ─────────────────────────────────────────────────────────
  [/^(item_)?(cold|fire|light|lightning|poison|magic)resist$/, "resist", (n) => {
    const raw = n.replace(/^item_/, "").replace(/resist$/, "");
    const map: Record<string, string> = {
      cold: "Cold Resist", fire: "Fire Resist",
      light: "Lightning Resist", lightning: "Lightning Resist",
      poison: "Poison Resist", magic: "Magic Resist",
    };
    return map[raw] ?? `${raw} Resist`;
  }],
  [/^all_resist$/, "resist", () => "All Resistances"],
  [/^item_resistall$/, "resist", () => "All Resistances"],
  [/^max(cold|fire|light|poison)resist$/, "resist", (n) => {
    const e = n.replace(/^max/, "").replace(/resist$/, "");
    const map: Record<string, string> = {
      cold: "Max Cold Resist", fire: "Max Fire Resist",
      light: "Max Lightning Resist", poison: "Max Poison Resist",
    };
    return map[e] ?? `Max ${e} Resist`;
  }],
  [/^item_absorbcold(_percent)?$/, "resist", (n) => n.includes("percent") ? "Absorb Cold %" : "Absorb Cold (Flat)"],
  [/^item_absorbfire(_percent)?$/, "resist", (n) => n.includes("percent") ? "Absorb Fire %" : "Absorb Fire (Flat)"],
  [/^item_absorblight(_percent)?$/, "resist", (n) => n.includes("percent") ? "Absorb Lightning %" : "Absorb Lightning (Flat)"],
  [/^item_absorbmagic$/, "resist", () => "Absorb Magic"],
  [/^item_poisonlengthresist$/, "resist", () => "Poison Length Reduced By"],
  [/^item_halffreezeduration$/, "resist", () => "Half Freeze Duration"],
  [/^item_cannotbefrozen$/, "resist", () => "Cannot Be Frozen"],
  [/^damageresist$/, "resist", () => "Physical Damage Reduction %"],
  [/^normal_damage_reduction$/, "resist", () => "Physical Damage Reduction (Flat)"],
  [/^magic_damage_reduction$/, "resist", () => "Magic Damage Reduction"],
  [/^curse_resistance$/, "resist", () => "Curse Resistance"],
  [/^passive_(cold|fire|ltng|pois|mag)_pierce$/, "resist", (n) => {
    const e = n.replace(/^passive_/, "").replace(/_pierce$/, "");
    const map: Record<string, string> = {
      cold: "Cold Pierce", fire: "Fire Pierce",
      ltng: "Lightning Pierce", pois: "Poison Pierce", mag: "Magic Pierce",
    };
    return map[e] ? `-Enemy ${map[e]}` : n;
  }],

  // ── Stats (primary attributes) ───────────────────────────────────────────
  [/^(item_)?(strength|dexterity|vitality|energy)$/, "stat", (n) => {
    const raw = n.replace(/^item_/, "");
    return `+${raw[0].toUpperCase()}${raw.slice(1)}`;
  }],
  [/^item_(strength|dexterity|vitality|energy)_perlevel$/, "stat", (n) => {
    const e = n.replace(/^item_/, "").replace(/_perlevel$/, "");
    return `+${e[0].toUpperCase()}${e.slice(1)} Per Level`;
  }],
  [/^all_attributes$/, "stat", () => "+All Attributes"],
  [/^maxhp$/, "stat", () => "+Life"],
  [/^maxmana$/, "stat", () => "+Mana"],
  [/^maxstamina$/, "stat", () => "+Stamina"],
  [/^item_hp_perlevel$/, "stat", () => "+Life Per Level"],
  [/^item_mana_perlevel$/, "stat", () => "+Mana Per Level"],
  [/^item_maxhp_percent$/, "stat", () => "+Life %"],
  [/^item_maxmana_percent$/, "stat", () => "+Mana %"],
  [/^hpregen$/, "stat", () => "Replenish Life"],
  [/^manarecoverybonus$/, "stat", () => "Mana Recovery Bonus"],
  [/^staminarecoverybonus$/, "stat", () => "Stamina Recovery Bonus"],
  [/^item_regenstamina_perlevel$/, "stat", () => "+Stamina Regen Per Level"],

  // ── Speed ────────────────────────────────────────────────────────────────
  [/^item_fastercastrate$/, "speed", () => "Faster Cast Rate"],
  [/^item_fastergethitrate$/, "speed", () => "Faster Hit Recovery"],
  [/^item_fasterattackrate$/, "speed", () => "Increased Attack Speed"],
  [/^item_fasterblockrate$/, "speed", () => "Faster Block Rate"],
  [/^item_fastermovevelocity$/, "speed", () => "Faster Run/Walk"],
  [/^item_leap_speed$/, "speed", () => "Leap Speed Bonus"],

  // ── Damage (elemental min/max, physical) ────────────────────────────────
  [/^(min_damage|mindamage)$/, "damage", () => "+Min Physical Damage"],
  [/^(max_damage|maxdamage)$/, "damage", () => "+Max Physical Damage"],
  [/^item_mindamage_percent$/, "damage", () => "+Min Damage %"],
  [/^item_maxdamage_percent(_perlevel)?$/, "damage", (n) => n.includes("perlevel") ? "+Max Damage % Per Level" : "+Max Damage %"],
  [/^item_maxdamage_perlevel$/, "damage", () => "+Max Damage Per Level"],
  [/^item_mindamage_energy$/, "damage", () => "+Min Damage (Energy Factor)"],
  [/^(cold|fire|light|poison)(min|max)?dam$/, "damage", (n) => {
    const ele = n.replace(/^(cold|fire|light|poison).*/, "$1");
    const part = n.includes("min") ? "Min" : n.includes("max") ? "Max" : "";
    const eMap: Record<string, string> = { cold: "Cold", fire: "Fire", light: "Lightning", poison: "Poison" };
    return `${eMap[ele] ?? ele} ${part} Damage`.trim();
  }],
  [/^lightmindam$/, "damage", () => "Lightning Min Damage"],
  [/^lightdam$/, "damage", () => "Lightning Max Damage"],
  [/^coldmindam$/, "damage", () => "Cold Min Damage"],
  [/^colddam$/, "damage", () => "Cold Max Damage"],
  [/^firemindam$/, "damage", () => "Fire Min Damage"],
  [/^firedam$/, "damage", () => "Fire Max Damage"],
  [/^coldlength$/, "damage", () => "Cold Duration"],
  [/^magicmindam$/, "damage", () => "Magic Min Damage"],
  [/^magicmaxdam$/, "damage", () => "Magic Max Damage"],
  [/^lifedrainmindam$/, "damage", () => "Life Drain Min Damage"],
  [/^manadrainmindam$/, "damage", () => "Mana Drain Min Damage"],
  [/^secondary_(min|max)damage$/, "damage", (n) => n.includes("min") ? "Secondary Min Damage" : "Secondary Max Damage"],
  [/^max_damage$/, "damage", () => "+Max Physical Damage"],
  [/^maxdamage_percent$/, "damage", () => "+Max Damage %"],
  [/^item_demondamage_percent$/, "damage", () => "Damage to Demons %"],
  [/^item_undeaddamage_percent$/, "damage", () => "Damage to Undead %"],
  [/^item_damage_undead_perlevel$/, "damage", () => "+Damage to Undead Per Level"],
  [/^item_deadlystrike(_perlevel)?$/, "damage", (n) => n.includes("perlevel") ? "Deadly Strike Per Level" : "Deadly Strike"],
  [/^item_maxdeadlystrike$/, "damage", () => "Max Deadly Strike"],
  [/^item_ds_multiplier$/, "damage", () => "Deadly Strike Multiplier"],
  [/^item_crushingblow(_efficiency)?$/, "damage", (n) => n.includes("efficiency") ? "Crushing Blow Efficiency" : "Crushing Blow"],
  [/^item_openwounds$/, "damage", () => "Open Wounds"],
  [/^deep_wounds$/, "damage", () => "Deep Wounds"],
  [/^item_crit_chance$/, "damage", () => "Critical Strike Chance"],
  [/^item_crit_multiplier$/, "damage", () => "Critical Strike Multiplier"],
  [/^item_damagetomana$/, "damage", () => "Damage Taken Goes to Mana"],
  [/^item_damagetargetac$/, "damage", () => "Lower Enemy Defense"],
  [/^item_fractionaltargetac$/, "damage", () => "Lower Enemy Defense %"],
  [/^item_ignoretargetac$/, "damage", () => "Ignore Target Defense"],
  [/^item_splashonhit$/, "damage", () => "Splash Damage On Hit"],
  [/^inc_splash_radius_permissinghp$/, "damage", () => "Splash Radius Per Missing HP"],
  [/^item_explosivearrow$/, "damage", () => "Explosive Arrows/Bolts"],
  [/^lifedrain_percentcap$/, "damage", () => "Life Drain % Cap"],
  [/^poisondam$/, "damage", () => "Poison Damage"],

  // ── Defense ─────────────────────────────────────────────────────────────
  [/^armorclass$/, "defense", () => "Defense"],
  [/^armorclass_vs_hth$/, "defense", () => "Defense vs Melee"],
  [/^armorclass_vs_missile$/, "defense", () => "Defense vs Missile"],
  [/^item_armor_percent$/, "defense", () => "Enhanced Defense %"],
  [/^item_armor_perlevel$/, "defense", () => "+Defense Per Level"],
  [/^toblock$/, "defense", () => "Chance to Block"],
  [/^item_fasterblockrate$/, "defense", () => "Faster Block Rate"],
  [/^maxdurability$/, "defense", () => "+Max Durability"],
  [/^item_maxdurability_percent$/, "defense", () => "+Max Durability %"],
  [/^item_indesctructible$/, "defense", () => "Indestructible"],
  [/^item_replenish_durability$/, "defense", () => "Replenish Durability"],

  // ── Leech ────────────────────────────────────────────────────────────────
  [/^item_healafterhit$/, "leech", () => "Life After Each Hit"],
  [/^item_healafterkill$/, "leech", () => "Life After Each Kill"],
  [/^item_manaafterkill$/, "leech", () => "Mana After Each Kill"],
  [/^item_attackertakesdamage$/, "leech", () => "Attacker Takes Damage (Flat)"],
  [/^item_attackertakeslightdamage$/, "leech", () => "Attacker Takes Lightning Damage"],
  [/^item_thorns_perlevel$/, "leech", () => "Thorns Per Level"],

  // ── Utility / misc ───────────────────────────────────────────────────────
  [/^item_magicbonus$/, "utility", () => "Magic Find"],
  [/^item_goldbonus$/, "utility", () => "Gold Find"],
  [/^item_find_magic_perlevel$/, "utility", () => "Magic Find Per Level"],
  [/^item_find_gold_perlevel$/, "utility", () => "Gold Find Per Level"],
  [/^item_addexperience$/, "utility", () => "+Experience Gained"],
  [/^item_lightradius$/, "utility", () => "Light Radius"],
  [/^item_levelreq$/, "utility", () => "Level Requirement Reduced By"],
  [/^item_req_percent$/, "utility", () => "Requirements %"],
  [/^item_reducedprices$/, "utility", () => "Reduced Vendor Prices"],
  [/^item_replenish_charges$/, "utility", () => "Replenish Charges"],
  [/^item_magicarrow$/, "skill", () => "Fires Magic Arrows"],
  [/^item_dmgpercent_pereth$/, "damage", () => "+Enhanced Damage Per Equipped Ethereal"],
  [/^item_freeze$/, "utility", () => "Freezes Target"],
  [/^item_slow$/, "utility", () => "Slows Target"],
  [/^item_knockback$/, "utility", () => "Knockback"],
  [/^item_howl$/, "utility", () => "Hit Causes Monster to Flee"],
  [/^item_preventheal$/, "utility", () => "Prevent Monster Heal"],
  [/^item_pierce$/, "utility", () => "Piercing Attack"],
  [/^item_staminadrainpct$/, "utility", () => "Less Stamina Drain %"],
  [/^item_demon_tohit$/, "utility", () => "+Attack Rating vs Demons"],
  [/^item_undead_tohit$/, "utility", () => "+Attack Rating vs Undead"],
  [/^item_tohit_percent$/, "utility", () => "+Attack Rating %"],
  [/^item_tohit_perlevel$/, "utility", () => "+Attack Rating Per Level"],
  [/^item_tohit_demon_perlevel$/, "utility", () => "+Attack Rating vs Demons Per Level"],
  [/^item_tohit_undead_perlevel$/, "utility", () => "+Attack Rating vs Undead Per Level"],
  [/^tohit$/, "utility", () => "+Attack Rating"],
  [/^item_extrablood$/, "utility", () => "Extra Blood (Cosmetic)"],
  [/^item_shiny_appearance$/, "utility", () => "Shiny Appearance (Cosmetic)"],
  [/^item_stupidity$/, "utility", () => "Slows Target (Stupidity)"],
  [/^item_dexterity_perlevel$/, "stat", () => "+Dexterity Per Level"],
  [/^item_vitality_perlevel$/, "stat", () => "+Vitality Per Level"],
  [/^item_restinpeace$/, "utility", () => "Slain Monsters Rest in Peace"],
  [/^item_maxhp_percent$/, "stat", () => "+Life %"],
  [/^item_maxmana_percent$/, "stat", () => "+Mana %"],

  // ── PD2-specific: passive mastery ────────────────────────────────────────
  [/^passive_(cold|fire|ltng|pois|mag)_mastery$/, "damage", (n) => {
    const e = n.replace(/^passive_/, "").replace(/_mastery$/, "");
    const map: Record<string, string> = {
      cold: "Cold Mastery", fire: "Fire Mastery",
      ltng: "Lightning Mastery", pois: "Poison Mastery", mag: "Magic Mastery",
    };
    return map[e] ?? `${e} Mastery`;
  }],
  [/^passive_phys_pierce$/, "damage", () => "Physical Pierce"],

  // ── PD2-specific: extra summons ───────────────────────────────────────────
  [/^extra_(golem|grizzly|hydra|revives|shadow|skele_archer|skele_mage|spirits|spiritwolf|valk|cold_arrows)$/, "skill", (n) => {
    const raw = n.replace(/^extra_/, "").replace(/_/g, " ");
    return `+Extra ${raw[0].toUpperCase()}${raw.slice(1)}`;
  }],
  [/^no_wolves$/, "skill", () => "No Wolves (Removes Wolves)"],

  // ── PD2-specific: curse/desecrate ────────────────────────────────────────
  [/^curse_effectiveness$/, "utility", () => "Curse Effectiveness"],
  [/^max_curses$/, "utility", () => "Max Curses"],
  [/^desecrated$/, "utility", () => "Desecrated (Debuff)"],
  [/^desecrator$/, "utility", () => "Desecrator (Source)"],

  // ── PD2-specific: joust / joustreduction ────────────────────────────────
  [/^joustreduction(_leorics)?$/, "defense", (n) => n.includes("leorics") ? "Joust Reduction (Leoric)" : "Joust Reduction"],

  // ── PD2-specific: misc ───────────────────────────────────────────────────
  [/^corrupted$/, "utility", () => "Corrupted"],
  [/^mirrored$/, "utility", () => "Mirrored"],
  [/^es_efficiency$/, "utility", () => "Energy Shield Efficiency"],
  [/^lifedrain_percentcap$/, "utility", () => "Life Drain % Cap"],
  [/^item_replenish_charges$/, "utility", () => "Replenish Charges"],
];

function classify(modName: string): DictEntry {
  for (const [pat, cat, labelFn] of PATTERNS) {
    if (pat.test(modName)) {
      return { category: cat, displayLabel: labelFn(modName) };
    }
  }
  // Fallback: title-case after stripping item_ prefix.
  const fallback = modName
    .replace(/^item_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { category: "other", displayLabel: fallback };
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const root = process.cwd();
  const snapshotPath = join(root, "data", "snapshot.json");

  const snap = JSON.parse(await readFile(snapshotPath, "utf8")) as {
    characters: Array<{
      items?: Array<{ modifiers?: Array<{ name?: string }> }>;
      mercenary?: { items?: Array<{ modifiers?: Array<{ name?: string }> }> };
    }>;
  };

  // Enumerate all distinct mod names.
  const seenMods = new Set<string>();
  for (const c of snap.characters) {
    for (const it of c.items ?? []) {
      for (const m of it.modifiers ?? []) {
        if (m.name) seenMods.add(m.name);
      }
    }
    for (const it of c.mercenary?.items ?? []) {
      for (const m of it.modifiers ?? []) {
        if (m.name) seenMods.add(m.name);
      }
    }
  }

  // Build dict via classifier.
  const dict: Record<string, DictEntry> = {};
  for (const id of [...seenMods].sort()) {
    dict[id] = classify(id);
  }

  // Merge overrides (manual fixes take priority).
  const overridesPath = join(root, "data", "mod-dictionary.overrides.json");
  if (existsSync(overridesPath)) {
    const overrides = JSON.parse(await readFile(overridesPath, "utf8")) as Record<string, DictEntry>;
    for (const [k, v] of Object.entries(overrides)) {
      dict[k] = v;
    }
  }

  await writeFile(
    join(root, "data", "mod-dictionary.json"),
    JSON.stringify(dict, null, 2),
    "utf8",
  );

  // ── Coverage report ───────────────────────────────────────────────────────
  const total = seenMods.size;
  console.log(`\nDistinct mod names in snapshot : ${total}`);
  console.log(`Dictionary entries             : ${Object.keys(dict).length}`);

  const byCat: Record<string, number> = {};
  for (const e of Object.values(dict)) {
    byCat[e.category] = (byCat[e.category] ?? 0) + 1;
  }
  console.log("\nBy category:");
  for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`  ${cat.padEnd(10)} : ${String(count).padStart(3)}  (${pct}%)`);
  }

  const others = Object.entries(dict).filter(([, e]) => e.category === "other");
  const otherPct = ((others.length / total) * 100).toFixed(1);
  console.log(`\n"other" bucket: ${others.length} / ${total} (${otherPct}%)`);
  if (others.length > 0) {
    console.log('Mods classified as "other" (review these):');
    for (const [k, v] of others) {
      console.log(`  ${k.padEnd(40)}  →  ${v.displayLabel}`);
    }
  }

  console.log(`\n✓ Wrote data/mod-dictionary.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
