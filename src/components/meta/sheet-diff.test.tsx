import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BuildSheetCard } from "./BuildSheetCard";
import { DiffCard } from "./DiffCard";
import { DEFAULT_META_STATE } from "@/lib/meta/state";
import { META_SLOTS, type CharacterDiff, type MetaCohort, type MetaSlot, type SkillUsageEntry, type SlotDiff } from "@/lib/meta/types";

afterEach(cleanup);

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
    coreStats: [],
    avgStats: [],
    topItemsBySlot: {},
    affixModsBySlot: {},
    charms: {},
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
      typeFrequency: [
        { mercType: "Defensive Auras", act: 2, numOccurrences: 80, totalSample: 100, pct: 80 },
        { mercType: "Combat Skills", act: 5, numOccurrences: 20, totalSample: 100, pct: 20 },
      ],
      topItemsBySlot: { helm: [{ itemName: "Andariel's Visage", itemType: "Unique", invCode: null, pct: 33 }] },
    },
    pricesComputedAt: null,
    ...o,
  }) as unknown as MetaCohort;

describe("BuildSheetCard", () => {
  it("shows core rows only, then reveals synergies and prerequisites", () => {
    render(<BuildSheetCard meta={cohort()} />);
    expect(screen.getByText("Build sheet")).toBeTruthy();
    expect(screen.getByText("Blessed Hammer")).toBeTruthy();
    expect(screen.getByText("20+ on 82%")).toBeTruthy();
    expect(screen.getAllByText("any points 97% · avg 18").length).toBeGreaterThan(0);
    expect(screen.queryByText("Smite Synergy")).toBeNull();
    expect(screen.queryByText("Prereq Only")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show synergies (1)" }));
    expect(screen.getByText("Smite Synergy")).toBeTruthy();
    expect(screen.queryByText("Prereq Only")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show prerequisites (1)" }));
    expect(screen.getByText("Prereq Only")).toBeTruthy();
  });

  it("falls back to skillFrequency when skillUsage is null", () => {
    render(<BuildSheetCard meta={cohort({ skillUsage: null })} />);
    expect(screen.getByText("Freq Skill")).toBeTruthy();
    expect(screen.queryByText("Blessed Hammer")).toBeNull();
  });

  it("names the mode level in the chart label", () => {
    render(<BuildSheetCard meta={cohort()} />);
    expect(screen.getByRole("img", { name: "Level 80 to 99 distribution, most at 85" })).toBeTruthy();
  });

  it("shows the mercenary type with its act and items", () => {
    render(<BuildSheetCard meta={cohort()} />);
    expect(screen.getByText("Act 2")).toBeTruthy();
    expect(screen.getByText("Top type")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.getByText("Andariel's Visage")).toBeTruthy();
  });

  it("shows the empty text for an empty cohort", () => {
    render(<BuildSheetCard meta={cohort({ poolSize: 0, skillUsage: [], levelDistribution: [] })} />);
    expect(screen.getByText("No characters match, so there is no build sheet yet.")).toBeTruthy();
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
          : s === "belt"
            ? slotDiff(s, { poolTopItemName: "Verdungos", userItemName: null })
            : slotDiff(s),
    ]),
  ) as CharacterDiff["slots"],
  ...o,
});

describe("DiffCard", () => {
  const state = { ...DEFAULT_META_STATE, gameMode: "hardcore" as const, char: "MC-MEEKS" };

  it("shows match and differs chips, a dash for an empty slot, and the affix chips", () => {
    render(<DiffCard diff={diff()} state={state} />);
    expect(screen.getByText("Your character vs the cohort")).toBeTruthy();
    expect(screen.getByText("MC-MEEKS · Level 95 Paladin · Hardcore")).toBeTruthy();
    const helm = screen.getByText("Helm").closest("tr")!;
    expect(within(helm).getByText("Matches the top pick")).toBeTruthy();
    expect(within(helm).getByText("49%")).toBeTruthy();
    expect(within(helm).getByLabelText("You have it")).toBeTruthy();
    expect(within(helm).getByLabelText("You do not have it")).toBeTruthy();
    const ring = screen.getByText("Ring").closest("tr")!;
    expect(within(ring).getByText("Differs")).toBeTruthy();
    const belt = screen.getByText("Belt").closest("tr")!;
    expect(within(belt).getByText("-")).toBeTruthy();
    expect(within(belt).queryByText("Differs")).toBeNull();
    expect(within(belt).queryByText("Matches the top pick")).toBeNull();
    expect(screen.getByText(/Merc: Defensive Auras \(cohort: Defensive Auras\)/)).toBeTruthy();
    expect(screen.queryByText(/Found in/)).toBeNull();
  });

  it("masks a profane character name", () => {
    render(<DiffCard diff={diff({ characterName: "FuckYou" })} state={state} />);
    expect(screen.queryByText(/FuckYou/)).toBeNull();
    expect(screen.getByText(/F\*{6} · Level 95/)).toBeTruthy();
  });

  it("notes when the character was found in the other game mode", () => {
    render(<DiffCard diff={diff()} state={{ ...state, gameMode: "softcore" }} />);
    expect(screen.getByText("Found in Hardcore; compared against the Hardcore pool.")).toBeTruthy();
  });

  it("shows the not found text with a track link", () => {
    render(<DiffCard diff={null} notFoundName="Foo Bar" state={{ ...state, season: 14 }} />);
    expect(screen.getByText('No character or account named "Foo Bar" this season.')).toBeTruthy();
    const a = screen.getByRole("link", { name: "Track this account" }) as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/builds/account?name=Foo%20Bar&season=14");
  });

  it("never mentions the downloader tool", () => {
    const { container } = render(
      <>
        <DiffCard diff={diff()} state={state} />
        <BuildSheetCard meta={cohort()} />
      </>,
    );
    expect(container.textContent).not.toContain("pd2-character-downloader");
  });
});
