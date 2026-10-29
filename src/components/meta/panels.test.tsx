import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AffixFrequencyTable } from "./AffixFrequencyTable";
import { AvgStatsPanel } from "./AvgStatsPanel";
import { BuildSheet } from "./BuildSheet";
import { CharmPanel } from "./CharmPanel";
import { DiffView } from "./DiffView";
import { ItemFrequencyTable } from "./ItemFrequencyTable";
import { TopAffixAveragesPanel } from "./TopAffixAveragesPanel";
import { DEFAULT_META_STATE } from "@/lib/meta/state";
import {
  META_SLOTS,
  type AffixSlot,
  type CharacterDiff,
  type MetaCohort,
  type MetaSlot,
  type SkillUsageEntry,
  type SlotDiff,
} from "@/lib/meta/types";

const emptyTop = () => Object.fromEntries(META_SLOTS.map((s) => [s, []])) as unknown as MetaCohort["topItemsBySlot"];
const emptyAffix = () => Object.fromEntries(META_SLOTS.map((s) => [s, { items: 0, mods: [] }])) as unknown as Record<MetaSlot, AffixSlot>;

const top = (): MetaCohort["topItemsBySlot"] => ({
  ...emptyTop(),
  helm: [
    { itemName: "Harlequin Crest", itemType: "Unique", count: 750, pct: 75, invCode: "xap", price: { medianHr: 0.3, samples: 12, source: "sold" }, runes: null, runeCostHr: null, runeCostEstimated: false },
    { itemName: "Some Unpriced Thing", itemType: "Unique", count: 10, pct: 1, invCode: null, price: null, runes: null, runeCostHr: null, runeCostEstimated: false },
  ],
  armor: [
    {
      itemName: "Enigma",
      itemType: "Runeword",
      count: 400,
      pct: 40,
      invCode: null,
      price: null,
      runes: [
        { rune: "Jah", medianHr: 2 },
        { rune: "Ith", medianHr: null },
        { rune: "Ber", medianHr: 1 },
      ],
      runeCostHr: 0.52,
      runeCostEstimated: true,
    },
  ],
});

const affix = (): Record<MetaSlot, AffixSlot> => ({
  ...emptyAffix(),
  helm: { items: 812, mods: [{ modName: "item_fastercastrate", displayLabel: "Faster Cast Rate", category: "x", count: 400, pct: 0.49, medianValue: 10, p75Value: 20 }] },
  ring: { items: 188, mods: [{ modName: "item_fastercastrate", displayLabel: "Faster Cast Rate", category: "x", count: 100, pct: 0.53, medianValue: 10, p75Value: 10 }] },
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ gearId: { name: "Harlequin Crest" }, afterAttributes: "+2 To All Skills, +10 To Vitality" }] })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ItemFrequencyTable", () => {
  it("shows share, price and a market link in the old row layout", () => {
    render(<ItemFrequencyTable data={top()} gameMode="softcore" />);
    const hq = screen.getAllByText("Harlequin Crest")[0].closest("tr")!;
    expect(within(hq).getByText("75.0%")).toBeTruthy();
    expect(within(hq).getByText("~0.3 HR")).toBeTruthy();
    expect(within(hq).getByText("Unique")).toBeTruthy();
    expect(hq.querySelector(".rarity-unique")).not.toBeNull();
    const link = within(hq).getByRole("link", { name: /pd2 market/ }) as HTMLAnchorElement;
    expect(link.href).toMatch(/^https:\/\/www\.projectdiablo2\.com\/market\?.*item\.unique\.id=\d+/);
    expect(link.target).toBe("_blank");
    const un = screen.getAllByText("Some Unpriced Thing")[0].closest("tr")!;
    expect(within(un).getByRole("link", { name: /pd2 market/ })).toBeTruthy();
  });

  it("uses the rune cost, in italic, when a runeword has no price", () => {
    render(<ItemFrequencyTable data={top()} gameMode="softcore" />);
    const row = screen.getAllByText("Enigma")[0].closest("tr")!;
    expect(row.querySelector(".rarity-runeword")).not.toBeNull();
    expect(within(row).getByText("~0.5 HR").className).toContain("italic");
  });

  it("opens the tooltip on focus only, portaled out of the table", async () => {
    render(<ItemFrequencyTable data={top()} gameMode="softcore" />);
    const trigger = screen.getAllByText("Harlequin Crest")[0].closest("[tabindex]") as HTMLElement;
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(trigger);
    const tip = await screen.findByRole("tooltip");
    expect(trigger.getAttribute("aria-describedby")).toBe(tip.id);
    expect(tip.closest("table")).toBeNull();
    await waitFor(() => expect(within(tip).getByText("+2 To All Skills")).toBeTruthy());
    expect(within(tip).getByText("12 sold in the last 7 days")).toBeTruthy();
    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
    // Prices come from /meta: the only request is the static item list.
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.every((c) => String(c[0]) === "/items.json")).toBe(true);
  });

  it("shows the rune rows in the tooltip of a runeword", async () => {
    render(<ItemFrequencyTable data={top()} gameMode="softcore" />);
    fireEvent.mouseEnter(screen.getAllByText("Enigma")[0].closest("[tabindex]")!);
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText("Jah + Ith + Ber")).toBeTruthy();
    expect(within(tip).getByText("Total ~0.52 HR")).toBeTruthy();
  });

  it("names the empty slots without NaN", () => {
    const { container } = render(<ItemFrequencyTable data={emptyTop()} gameMode="softcore" />);
    expect(screen.getAllByText("— no fixed-quality items mapped —").length).toBe(9);
    expect(container.textContent).not.toMatch(/NaN/);
  });
});

describe("AffixFrequencyTable", () => {
  it("lists the combined mods, then the median and p75 by slot", () => {
    render(<AffixFrequencyTable data={affix()} />);
    expect(screen.getByText("All slots combined")).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getAllByText("P75").length).toBeGreaterThan(0);
    expect(screen.getAllByText("20").length).toBe(1);
  });

  it("says so for slots without rares", () => {
    render(<AffixFrequencyTable data={emptyAffix()} />);
    expect(screen.getAllByText("— no rare/magic/crafted items —").length).toBe(9);
  });
});

describe("CharmPanel", () => {
  it("shows the counts and the grand charm mods", () => {
    render(
      <CharmPanel
        data={{
          avgCount: 7.46,
          annihilus: { count: 410, pct: 0.41 },
          torch: { count: 100, pct: 0.1 },
          gheeds: { count: 50, pct: 0.05 },
          topGcMods: [{ modName: "a", displayLabel: "Max Life", count: 1500, pct: 1.5 }],
          topScMods: [],
        }}
      />,
    );
    expect(screen.getByText("7.5")).toBeTruthy();
    expect(screen.getByText("410")).toBeTruthy();
    expect(screen.getByText("1,500")).toBeTruthy();
    expect(screen.getByText("— no data —")).toBeTruthy();
  });
});

describe("AvgStatsPanel and TopAffixAveragesPanel", () => {
  it("rounds the core stats and prints the affix averages", () => {
    render(
      <>
        <AvgStatsPanel rows={[{ key: "life", label: "Life", avg: 1234.6 }]} />
        <TopAffixAveragesPanel rows={[{ modName: "m", displayLabel: "Faster Cast Rate", suffix: "%", avgValue: 42.4, charsWithMod: 82, pctOfChars: 0.82 }]} />
      </>,
    );
    expect(screen.getByText("1,235")).toBeTruthy();
    expect(screen.getByText("42.4%")).toBeTruthy();
    expect(screen.getByText("82% of chars")).toBeTruthy();
  });
});

const usage = (o: Partial<SkillUsageEntry> & { name: string }): SkillUsageEntry => ({
  numWithAny: 97,
  numAsBuild: 80,
  numAsPrereq: 0,
  numAtTwenty: 82,
  avgBaseLevel: 18.2,
  avgBaseLevelAsBuild: 20,
  totalSample: 100,
  pctBuild: 0.8,
  pctAny: 0.97,
  pctAtTwenty: 0.82,
  role: "core",
  ...o,
});

const cohort = (o: Partial<MetaCohort> = {}): MetaCohort =>
  ({
    season: 14,
    mode: "softcore",
    className: "Paladin",
    minLevel: 80,
    skills: [],
    poolSize: 100,
    basePoolSize: 100,
    skillFrequency: [{ name: "Freq Skill", numOccurrences: 5, totalSample: 10, pct: 50 }],
    skillUsage: [
      usage({ name: "Blessed Hammer" }),
      usage({ name: "Vigor", pctAtTwenty: 0.5, numAtTwenty: 50 }),
      usage({ name: "Smite Synergy", role: "synergy", pctAtTwenty: 0.3, numAtTwenty: 30 }),
      usage({ name: "Prereq Only", numAtTwenty: 0, pctAtTwenty: 0, numAsPrereq: 40, role: "synergy" }),
    ],
    levelDistribution: [
      { level: 80, count: 5 },
      { level: 85, count: 40 },
      { level: 90, count: 10 },
    ],
    mercenary: {
      topType: "Defensive Auras",
      typeFrequency: [],
      topItemsBySlot: { helm: [{ itemName: "Andariel's Visage", itemType: "Unique", invCode: null, pct: 33 }] },
    },
    pricesComputedAt: null,
    ...o,
  }) as unknown as MetaCohort;

describe("BuildSheet", () => {
  it("shows core rows only, then reveals synergies and prerequisites", () => {
    render(<BuildSheet meta={cohort()} />);
    expect(screen.getByText("Blessed Hammer")).toBeTruthy();
    expect(screen.getAllByText("82.0%").length).toBeGreaterThan(0);
    expect(screen.queryByText("Smite Synergy")).toBeNull();
    expect(screen.queryByText("Prereq Only")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show synergies (1)" }));
    expect(screen.getByText("Smite Synergy")).toBeTruthy();
    expect(screen.queryByText("Prereq Only")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show prerequisites (1)" }));
    expect(screen.getByText("Prereq Only")).toBeTruthy();
  });

  it("falls back to skillFrequency when skillUsage is null", () => {
    render(<BuildSheet meta={cohort({ skillUsage: null })} />);
    expect(screen.getByText("Freq Skill")).toBeTruthy();
    expect(screen.queryByText("Blessed Hammer")).toBeNull();
  });

  it("shows the level bars and the mercenary", () => {
    render(<BuildSheet meta={cohort()} />);
    expect(screen.getByRole("img", { name: "Level distribution" })).toBeTruthy();
    expect(screen.getByText("85")).toBeTruthy();
    expect(screen.getByText("Defensive Auras")).toBeTruthy();
    expect(screen.getByText("Andariel's Visage")).toBeTruthy();
  });
});

const slotDiff = (slot: MetaSlot, o: Partial<SlotDiff> = {}): SlotDiff => ({
  slot,
  poolTopItemName: null,
  userItemName: null,
  userItemQuality: null,
  userMatchesPoolTop: false,
  poolTopAffixMods: [],
  ...o,
});

const diff = (o: Partial<CharacterDiff> = {}): CharacterDiff => ({
  characterName: "MC-MEEKS",
  accountName: "acc",
  characterLevel: 95,
  className: "Paladin",
  mode: "hardcore",
  mercTypeMatchesPool: true,
  poolMercType: "Defensive Auras",
  userMercType: "Defensive Auras",
  slots: Object.fromEntries(
    META_SLOTS.map((s) => [
      s,
      s === "helm"
        ? slotDiff(s, {
            poolTopItemName: "Harlequin Crest",
            userItemName: "Harlequin Crest",
            userItemQuality: "Unique",
            userMatchesPoolTop: true,
            poolTopAffixMods: [
              { modName: "a", displayLabel: "Faster Cast Rate", pct: 0.49, userHas: true },
              { modName: "b", displayLabel: "Max Life", pct: 0.3, userHas: false },
            ],
          })
        : s === "ring"
          ? slotDiff(s, { poolTopItemName: "Stone of Jordan", userItemName: "Nagelring", userItemQuality: "Unique" })
          : slotDiff(s),
    ]),
  ) as CharacterDiff["slots"],
  ...o,
});

describe("DiffView", () => {
  const state = { ...DEFAULT_META_STATE, gameMode: "hardcore" as const, char: "MC-MEEKS" };

  it("shows the character line, the merc line, the matches and the affix ticks", () => {
    render(<DiffView diff={diff()} state={state} />);
    expect(screen.getByText("MC-MEEKS")).toBeTruthy();
    expect(screen.getByText("L95")).toBeTruthy();
    expect(screen.getByText(/matches pool top: Defensive Auras/)).toBeTruthy();
    const helm = screen.getByRole("group", { name: "Helm" });
    expect(within(helm).getAllByText("Harlequin Crest").length).toBe(2);
    expect(within(helm).getByLabelText("You have it")).toBeTruthy();
    expect(within(helm).getByLabelText("You do not have it")).toBeTruthy();
    expect(within(helm).getByText("(49% of pool)")).toBeTruthy();
    const ring = screen.getByRole("group", { name: "Ring" });
    expect(within(ring).getByText("Nagelring")).toBeTruthy();
    expect(screen.queryByText(/Found in/)).toBeNull();
  });

  it("masks a profane character name", () => {
    render(<DiffView diff={diff({ characterName: "FuckYou" })} state={state} />);
    expect(screen.queryByText(/FuckYou/)).toBeNull();
    expect(screen.getByText(/F\*{6}/)).toBeTruthy();
  });

  it("notes when the character was found in the other game mode", () => {
    render(<DiffView diff={diff()} state={{ ...state, gameMode: "softcore" }} />);
    expect(screen.getByText("Found in Hardcore; compared against the Hardcore pool.")).toBeTruthy();
  });

  it("shows the not found text with a track link", () => {
    render(<DiffView diff={null} notFoundName="Foo Bar" state={{ ...state, season: 14 }} />);
    expect(screen.getByText('No character or account named "Foo Bar" this season.')).toBeTruthy();
    const a = screen.getByRole("link", { name: "Track this account" }) as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/builds/account?name=Foo%20Bar&season=14");
  });
});
