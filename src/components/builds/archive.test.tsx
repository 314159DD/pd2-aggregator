import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => "/builds",
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { BuildsView } from "./BuildsView";
import { ShoppingList } from "./ShoppingList";
import { CharacterHeader, type HeaderInfo } from "@/components/character/CharacterHeader";
import { LevelChart } from "@/components/character/LevelChart";
import { MetaView } from "@/components/meta/MetaView";
import { isArchiveSeason } from "@/lib/builds/scope";
import type { SeasonsResponse } from "@/lib/builds/types";

const seasons: SeasonsResponse = {
  current: 14,
  seasons: [
    { season: 14, name: "Alliance", current: true, characters: { softcore: 1, hardcore: 1 } },
    { season: 13, name: "Archive", current: false, characters: { softcore: 1, hardcore: 1 } },
  ],
};

const item = (name: string, medianHr: number | null) => ({ name, itemType: "Unique" as const, invCode: null, baseType: null, count: 5, pct: 40, medianHr });
const usage = {
  seasonTotal: 100,
  total: 100,
  breakdown: { Amazon: 1, Assassin: 1, Barbarian: 1, Druid: 1, Necromancer: 1, Paladin: 1, Sorceress: 1, total: 7 },
  skills: [],
  items: [item("Griffon's Eye", null), item("Arachnid Mesh", null)],
  mercTypes: [],
  mercItems: [],
};
const row = {
  name: "Foo",
  className: "Paladin",
  level: 95,
  life: 1000,
  topSkills: [],
  keyGear: [],
  gearValueHr: null,
  gearValuePartial: false,
};
const characters = { total: 1, page: 1, pageSize: 25, pages: 1, sort: "level", dir: "desc", characters: [row] };

let urls: string[] = [];
function mockApi() {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      urls.push(u);
      const body = u.includes("/builds/usage")
        ? usage
        : u.includes("/builds/characters")
          ? characters
          : u.includes("/builds/history")
            ? { days: [] }
            : seasons;
      return { ok: true, status: 200, json: async () => body };
    }),
  );
}

beforeEach(mockApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("isArchiveSeason", () => {
  it("is true only for a known past season", () => {
    expect(isArchiveSeason(13, seasons)).toBe(true);
    expect(isArchiveSeason(14, seasons)).toBe(false);
    expect(isArchiveSeason(null, seasons)).toBe(false);
    expect(isArchiveSeason(13, null)).toBe(false);
  });
});

describe("builds view", () => {
  it("hides budget, gear column and sum for a shared archive link", async () => {
    search = "season=13&maxGearHr=5&sort=gear";
    const { container } = render(<BuildsView />);
    expect(await screen.findByText("Shopping list")).toBeTruthy();
    expect(screen.queryByLabelText("Add account")).toBeNull();
    expect(screen.queryByText("Gear budget")).toBeNull();
    expect(screen.queryByText(/^Budget/)).toBeNull();
    expect(screen.queryByText("Gear HR")).toBeNull();
    expect(container.textContent).not.toContain("Σ");
    expect(container.textContent).not.toContain("NaN");
    expect(urls.filter((u) => u.includes("/builds/usage")).every((u) => !u.includes("maxGearHr"))).toBe(true);
    expect(urls.filter((u) => u.includes("/builds/characters")).every((u) => !u.includes("maxGearHr"))).toBe(true);
    expect(urls.some((u) => u.includes("/prices"))).toBe(false);
  });

  it("keeps the slider and the gear column for the current season", async () => {
    search = "season=14&maxGearHr=5";
    render(<BuildsView />);
    expect(await screen.findByText("Gear budget")).toBeTruthy();
    expect(screen.getByText("Gear HR")).toBeTruthy();
    expect(screen.getByText(/^Budget/)).toBeTruthy();
    expect(screen.getByLabelText("Add account")).toBeTruthy();
  });

  it("waits for the seasons before fetching an archive link: one usage request, no budget, no slider", async () => {
    search = "season=13&maxGearHr=5&sort=gear";
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = globalThis.fetch as unknown as (u: string) => Promise<unknown>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/builds/seasons")) {
          urls.push(String(url));
          await gate;
          return { ok: true, status: 200, json: async () => seasons };
        }
        return base(url);
      }),
    );
    const { container } = render(<BuildsView />);
    await new Promise((r) => setTimeout(r, 400));
    expect(urls.filter((u) => u.includes("/builds/usage")).length).toBe(0);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText("Gear budget")).toBeNull();
    release();
    expect(await screen.findByText("Shopping list")).toBeTruthy();
    const usageUrls = urls.filter((u) => u.includes("/builds/usage"));
    expect(usageUrls.length).toBe(1);
    expect(usageUrls[0]).not.toContain("maxGearHr");
    expect(screen.queryByText("Gear budget")).toBeNull();
  });

  it("falls back to the current-season view when the seasons request fails", async () => {
    search = "season=13&maxGearHr=5";
    const base = globalThis.fetch as unknown as (u: string) => Promise<unknown>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/builds/seasons")) throw new Error("down");
        return base(url);
      }),
    );
    render(<BuildsView />);
    expect(await screen.findByText("Gear budget")).toBeTruthy();
    expect(screen.getByLabelText("Add account")).toBeTruthy();
  });

  it("shows Lvl as the active sort column when sort=gear is requested on an archive season", async () => {
    search = "season=13&sort=gear";
    render(<BuildsView />);
    expect(await screen.findByText("Shopping list")).toBeTruthy();
    const th = screen.getByRole("columnheader", { name: /Lvl/ });
    expect(th.getAttribute("aria-sort")).toBe("descending");
  });
});

describe("shopping list", () => {
  it("shows names and shares but no prices for an archive", () => {
    const { container } = render(<ShoppingList items={usage.items} archive />);
    expect(screen.getByText("Griffon's Eye")).toBeTruthy();
    expect(screen.getAllByText("40%").length).toBe(2);
    expect(screen.queryByText("n/a")).toBeNull();
    expect(container.textContent).not.toContain("Σ");
    expect(screen.getByText("The 10 items most worn by characters matching your filters. Past seasons have no market prices.")).toBeTruthy();
  });
});

describe("character", () => {
  const info: HeaderInfo = {
    name: "Foo",
    className: "Paladin",
    level: 95,
    mode: "softcore",
    season: 13,
    seasonName: "Archive",
    account: "Acc",
    lastIngestedAt: new Date().toISOString(),
    gearValueHr: null,
    gearPartial: false,
    mercValueHr: null,
    archive: true,
  };
  it("has no Refresh button and says Archived season", () => {
    render(<CharacterHeader info={info} />);
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(screen.getByText("Archived season")).toBeTruthy();
    expect(screen.queryByText(/Updated/)).toBeNull();
  });
  it("level chart explains the missing history", () => {
    render(<LevelChart history={[]} archive />);
    expect(screen.getByText("No level history for archived seasons.")).toBeTruthy();
  });
});

describe("meta view", () => {
  it("states that prices are missing and shows n/a for items", async () => {
    search = "className=Paladin&season=13";
    const cohort = {
      season: 13,
      mode: "softcore",
      className: "Paladin",
      minLevel: 85,
      skills: [],
      poolSize: 10,
      basePoolSize: 10,
      topItemsBySlot: {
        weapon: [{ itemName: "Griffon's Eye", itemType: "Unique", count: 5, pct: 50, invCode: null, price: null, runes: null, runeCostHr: null, runeCostEstimated: false }],
      },
      pricesComputedAt: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        const body = u.includes("/meta?") ? cohort : u.includes("/builds/seasons") ? seasons : u.includes("skill-usage") ? [] : {};
        return { ok: true, status: 200, json: async () => body };
      }),
    );
    render(<MetaView />);
    expect(await screen.findByText("Past season: item prices and rune costs are not available.")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("n/a").length).toBeGreaterThan(0));
  });
});
