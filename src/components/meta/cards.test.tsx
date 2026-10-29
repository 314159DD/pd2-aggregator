import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AffixCard } from "./AffixCard";
import { AvgStatsCard } from "./AvgStatsCard";
import { CharmsCard } from "./CharmsCard";
import { TopItemsCard } from "./TopItemsCard";
import { META_SLOTS, type AffixSlot, type MetaCohort, type MetaSlot } from "@/lib/meta/types";

const emptyTop = () => Object.fromEntries(META_SLOTS.map((s) => [s, []])) as unknown as MetaCohort["topItemsBySlot"];
const emptyAffix = () =>
  Object.fromEntries(META_SLOTS.map((s) => [s, { items: 0, mods: [] }])) as unknown as Record<MetaSlot, AffixSlot>;

const top = (): MetaCohort["topItemsBySlot"] => ({
  ...emptyTop(),
  helm: [
    {
      itemName: "Harlequin Crest",
      itemType: "Unique",
      count: 750,
      pct: 75,
      invCode: "xap",
      price: { medianHr: 0.3, samples: 12, source: "sold" },
      runes: null,
      runeCostHr: null,
      runeCostEstimated: false,
    },
    {
      itemName: "Some Unpriced Thing",
      itemType: "Unique",
      count: 10,
      pct: 1,
      invCode: null,
      price: null,
      runes: null,
      runeCostHr: null,
      runeCostEstimated: false,
    },
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
  helm: {
    items: 812,
    mods: [{ modName: "item_fastercastrate", displayLabel: "Faster Cast Rate", category: "x", count: 400, pct: 0.49, medianValue: 10, p75Value: 20 }],
  },
  ring: {
    items: 188,
    mods: [{ modName: "item_fastercastrate", displayLabel: "Faster Cast Rate", category: "x", count: 100, pct: 0.53, medianValue: 10, p75Value: 10 }],
  },
});

const charms = () => ({
  avgCount: 7.46,
  annihilus: { count: 410, pct: 0.41 },
  torch: { count: 100, pct: 0.1 },
  gheeds: { count: 50, pct: 0.05 },
  topGcMods: [{ modName: "a", displayLabel: "Max Life", count: 1500, pct: 1.5 }],
  topScMods: [],
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { gearId: { name: "Harlequin Crest" }, afterAttributes: "+2 To All Skills, +10 To Vitality" },
      ],
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TopItemsCard", () => {
  it("shows share, price, n/a with a market link", () => {
    render(<TopItemsCard data={top()} gameMode="softcore" />);
    const hq = screen.getAllByText("Harlequin Crest")[0].closest("tr")!;
    expect(within(hq).getByText("75%")).toBeTruthy();
    expect(within(hq).getByText("0.30 HR")).toBeTruthy();
    const un = screen.getAllByText("Some Unpriced Thing")[0].closest("tr")!;
    expect(within(un).getByText("n/a")).toBeTruthy();
    const link = within(un).getByRole("link", { name: "Market" }) as HTMLAnchorElement;
    expect(link.href.startsWith("https://www.projectdiablo2.com/market?")).toBe(true);
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener");
    const hqLink = within(hq).getByRole("link", { name: "Market" }) as HTMLAnchorElement;
    expect(hqLink.href).toMatch(/item\.unique\.id=\d+/);
  });

  it("uses the estimated rune cost when a runeword has no price", () => {
    render(<TopItemsCard data={top()} gameMode="softcore" />);
    expect(screen.getByText("~0.52 HR")).toBeTruthy();
    expect(screen.getByText("Runes ~0.52 HR")).toBeTruthy();
  });

  it("tooltip opens on focus only, is portaled out of the table and describes the trigger", async () => {
    render(<TopItemsCard data={top()} gameMode="softcore" />);
    const name = screen.getAllByText("Harlequin Crest")[0];
    const trigger = name.closest("[tabindex]") as HTMLElement;
    expect(trigger.getAttribute("tabindex")).toBe("0");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(trigger.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText("12 sold in the last 7 days")).toBeNull();
    fireEvent.focus(trigger);
    const tip = await screen.findByRole("tooltip");
    expect(trigger.getAttribute("aria-describedby")).toBe(tip.id);
    expect(tip.parentElement).toBe(document.body);
    expect(tip.closest("table")).toBeNull();
    await waitFor(() => expect(within(tip).getByText("+2 To All Skills")).toBeTruthy());
    expect(within(tip).getByText("12 sold in the last 7 days")).toBeTruthy();
    expect(within(tip).getByText("Median 0.30 HR")).toBeTruthy();
    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(trigger.getAttribute("aria-describedby")).toBeNull();
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.every((c) => String(c[0]) === "/items.json")).toBe(true);
  });

  it("tooltip shows rune rows with unknown price and the estimated total", async () => {
    render(<TopItemsCard data={top()} gameMode="softcore" />);
    fireEvent.mouseEnter(screen.getAllByText("Enigma")[0].closest("[tabindex]")!);
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText("n/a, counted as 0.01")).toBeTruthy();
    expect(within(tip).getByText("Jah + Ith + Ber")).toBeTruthy();
    expect(within(tip).getByText("Total ~0.52 HR")).toBeTruthy();
  });

  it("has a column header row", () => {
    render(<TopItemsCard data={top()} gameMode="softcore" />);
    expect(screen.getAllByRole("columnheader", { name: "Price" }).length).toBeGreaterThan(0);
  });
});

describe("AffixCard", () => {
  it("lists median and p75 by slot and totals across slots", () => {
    render(<AffixCard data={affix()} />);
    expect(screen.getByText("Helm · 812 items")).toBeTruthy();
    expect(screen.getAllByText("Median").length).toBeGreaterThan(0);
    expect(screen.getAllByText("P75").length).toBeGreaterThan(0);
    expect(screen.getAllByText("20").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "All slots" }));
    expect(screen.getByText("% of items")).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });
});

describe("AffixCard expander", () => {
  it("shows the top 8 and expands on demand", () => {
    const data = emptyAffix();
    data.helm = {
      items: 100,
      mods: Array.from({ length: 12 }, (_, i) => ({ modName: `m${i}`, displayLabel: `Mod ${i}`, category: "x", count: 50 - i, pct: 0.5, medianValue: 1, p75Value: 2 })),
    };
    render(<AffixCard data={data} />);
    expect(screen.queryByText("Mod 8")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show all 12/ }));
    expect(screen.getByText("Mod 11")).toBeTruthy();
  });
});

describe("CharmsCard", () => {
  it("shows tile shares and shares above 100%", () => {
    render(<CharmsCard data={charms()} />);
    expect(screen.getByText("41%")).toBeTruthy();
    expect(screen.getByText("150%")).toBeTruthy();
    expect(screen.getByText("7.5")).toBeTruthy();
  });
});

describe("AvgStatsCard", () => {
  it("formats core tiles and stat rows", () => {
    render(
      <AvgStatsCard
        core={[{ key: "life", label: "Life", avg: 1234.6 }]}
        avg={[{ modName: "m", displayLabel: "Faster Cast Rate", suffix: "%", avgValue: 42.4, charsWithMod: 82, pctOfChars: 0.82 }]}
      />,
    );
    expect(screen.getByText("1,235")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("on 82% of characters")).toBeTruthy();
  });
});

describe("empty cohort", () => {
  it("renders every empty text and no NaN", () => {
    const { container } = render(
      <>
        <AvgStatsCard core={[]} avg={[]} />
        <TopItemsCard data={emptyTop()} gameMode="softcore" />
        <AffixCard data={emptyAffix()} />
        <CharmsCard
          data={{ avgCount: 0, annihilus: { count: 0, pct: 0 }, torch: { count: 0, pct: 0 }, gheeds: { count: 0, pct: 0 }, topGcMods: [], topScMods: [] }}
        />
      </>,
    );
    expect(screen.getByText("No gear stats for this cohort.")).toBeTruthy();
    expect(screen.getAllByText("No unique, set or runeword items in this slot.").length).toBe(9);
    expect(screen.getAllByText("No magic, rare or crafted items in this slot.").length).toBe(9);
    expect(screen.getAllByText("No charms in this cohort.").length).toBe(2);
    expect(container.textContent).not.toMatch(/NaN/);
  });
});
