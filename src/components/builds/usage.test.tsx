import { describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen } from "@testing-library/react";
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => "/builds",
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { BuildsView } from "./BuildsView";
import { UsageCard } from "./UsageCard";
import { ShoppingList } from "./ShoppingList";
import type { ItemUsageEntry } from "@/lib/builds/types";

const item = (name: string, medianHr: number | null = 0.1, pct = 50): ItemUsageEntry => ({
  name, count: 5, pct, itemType: "Unique", invCode: null, medianHr,
});

describe("UsageCard", () => {
  const names = ["Ber Rune", "Jah", "Enigma", "Grief", "Heart", "Spirit", "Insight", "Fortitude", "Oath", "Call", "Bonebreak", "Faith"];
  const entries = names.map((n) => item(n));
  const rowCount = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed")).length;

  it("shows top 8, expands, and filters", () => {
    render(<UsageCard title="Items" entries={entries} selected={[]} onToggle={() => {}} />);
    expect(rowCount()).toBe(8);
    fireEvent.click(screen.getByText("Show all 12"));
    expect(rowCount()).toBe(12);
    expect(screen.getByText("Show top 8")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search 12 items..."), { target: { value: "ber" } });
    expect(screen.getByText("Ber Rune")).toBeTruthy();
    expect(screen.queryByText("Jah")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Search 12 items..."), { target: { value: "zzz" } });
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("toggles and marks selected", () => {
    const onToggle = vi.fn();
    render(<UsageCard title="Items" entries={entries} selected={["Jah"]} onToggle={onToggle} />);
    const row = screen.getByRole("button", { name: /Jah/ });
    expect(row.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(row);
    expect(onToggle).toHaveBeenCalledWith("Jah");
  });

  it("shows merc act caption", () => {
    render(
      <UsageCard
        title="Mercenary"
        entries={[{ name: "Fire Arrow", count: 1, pct: 40, act: 1 }, { name: "Cold", count: 1, pct: 10, act: null }]}
        selected={[]}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText("Act 1")).toBeTruthy();
    expect(screen.queryAllByText(/^Act /)).toHaveLength(1);
  });
});

describe("ShoppingList", () => {
  const list = [item("A", 0.2), item("B", 0.34), item("C", null), ...Array.from({ length: 7 }, (_, i) => item(`X${i}`, 0.1))];

  it("sums prices and flags unpriced", () => {
    render(<ShoppingList items={list} />);
    const sum = screen.getByText("Σ 1.24 HR+");
    expect(sum.getAttribute("title")).toBe("Some items have no price yet");
    expect(screen.getAllByText("n/a")).toHaveLength(1);
    const links = screen.getAllByRole("link", { name: "Market" });
    expect(links).toHaveLength(9);
    expect(links[0].getAttribute("href")!.startsWith("https://www.projectdiablo2.com/market?")).toBe(true);
    expect(links[0].getAttribute("target")).toBe("_blank");
  });

  it("empty state", () => {
    render(<ShoppingList items={[]} />);
    expect(screen.getByText("No items match these filters.")).toBeTruthy();
    expect(screen.getByText("Σ 0.00 HR")).toBeTruthy();
  });
});

describe("Usage wiring", () => {
  it("Skills card marks the rows named in state.skills", async () => {
    search = "skills=" + encodeURIComponent(JSON.stringify([{ name: "Smite", minLevel: 20 }]));
    const usage = {
      seasonTotal: 10, total: 10,
      breakdown: { Amazon: 0, Assassin: 0, Barbarian: 0, Druid: 0, Necromancer: 0, Paladin: 10, Sorceress: 0, total: 10 },
      skills: [{ name: "Blessed Hammer", count: 5, pct: 50 }, { name: "Smite", count: 3, pct: 30 }],
      items: [], mercTypes: [], mercItems: [],
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      const body = u.includes("/builds/usage") ? usage
        : u.includes("/builds/characters") ? { total: 0, page: 1, pageSize: 25, pages: 1, sort: "level", dir: "desc", characters: [] }
        : u.includes("/builds/history") ? { days: [] }
        : { current: 14, seasons: [] };
      return { ok: true, status: 200, json: async () => body };
    }));
    render(<BuildsView />);
    expect((await screen.findByRole("button", { name: /^Smite/ })).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Blessed Hammer/ }).getAttribute("aria-pressed")).toBe("false");
    vi.unstubAllGlobals();
  });

  it("a merc card search without hits shows No matches", () => {
    render(<UsageCard title="Merc items" entries={[item("Insight")]} selected={[]} onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search 1 merc items..."), { target: { value: "xyz" } });
    expect(screen.getByText("No matches")).toBeTruthy();
  });
});
