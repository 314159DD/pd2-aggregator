import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import ladder from "../../../server/test/fixtures/character-ladder.json";

let search = "name=MC-MEEKS&season=14&gameMode=softcore";
vi.mock("next/navigation", () => ({
  usePathname: () => "/builds/character",
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { CharacterView } from "./CharacterView";
import { CharacterHeader, type HeaderInfo } from "./CharacterHeader";
import { EquipmentGrid } from "./EquipmentGrid";
import { LevelChart } from "./LevelChart";
import { SkillsPanel } from "./SkillsPanel";
import { StatsPanel } from "./StatsPanel";
import type { RawItem } from "./ItemTip";
import type { CharStats } from "@/lib/builds/types";

const stats = (over: Partial<CharStats> = {}): CharStats =>
  ({
    fireRes: 75, maxFireRes: 75, coldRes: -20, maxColdRes: 75, lightningRes: 75, maxLightningRes: 75, poisonRes: 50, maxPoisonRes: 75,
    strength: 111, dexterity: 110, vitality: 261, energy: 15,
    fasterCastRate: 20, increasedAttackSpeed: 30, fasterHitRecovery: 10, fasterRunWalk: 30,
    crushingBlow: 0, criticalStrike: 0, deadlyStrike: 5, openWounds: 0, openWoundsDPS: 0,
    physicalDamageReduction: 10, magicFind: 0, goldFind: 0,
    lifeLeech: 7, manaLeech: 0, hpPerKill: 0, mpPerKill: 0,
    lAbsorbPct: 0, lAbsorbFlat: 3, cAbsorbPct: 0, cAbsorbFlat: 0, fAbsorbPct: 2, fAbsorbFlat: 0, mAbsorbFlat: 0,
    fireSkillDamage: 0, coldSkillDamage: 0, lightningSkillDamage: 0, poisonSkillDamage: 0,
    firePierce: 0, coldPierce: 0, lightningPierce: 0, poisonPierce: 0,
    ...over,
  }) as CharStats;

const detail = (over: Record<string, unknown> = {}) => ({
  ...ladder,
  accountName: "MC-MEEKS",
  realSkills: [
    { skill: "Sacrifice", level: 7 },
    { skill: "Resist Cold", level: 34, baseLevel: 20 },
  ],
  realStats: stats(),
  gear: { valueHr: 12.3, partial: true, mercValueHr: 1.2 },
  prices: { "Nightwing's Veil": null, Azurewrath: { medianHr: 0.34, samples: 12, source: "sold" } },
  season: 14,
  mode: "softcore",
  lastIngestedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  ...over,
});
const history = { history: [{ ts: "2026-10-24T10:00:00Z", level: 85, experience: 1 }, { ts: "2026-10-29T10:00:00Z", level: 95, experience: 2 }], total: 2 };

function mockApi(opts: { status?: number; queue?: number; hist?: unknown } = {}) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/accounts/queue")) return { ok: (opts.queue ?? 200) < 400, status: opts.queue ?? 200, json: async () => ({}) };
    if (u.includes("/history")) return { ok: true, status: 200, json: async () => opts.hist ?? history };
    if (u.includes("/builds/seasons")) return { ok: true, status: 200, json: async () => ({ current: 14, seasons: [{ season: 14, name: "Alliance", current: true, characters: { softcore: 1, hardcore: 1 } }] }) };
    void init;
    if (opts.status === 404) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => detail() };
  });
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => {
  vi.unstubAllGlobals();
  search = "name=MC-MEEKS&season=14&gameMode=softcore";
});

describe("character page", () => {
  it("header shows level, class, account link and the gear capsules", async () => {
    mockApi();
    render(<CharacterView />);
    expect(await screen.findByText(/Alliance \(S14\)/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Alli_pal");
    expect(document.body.textContent).toMatch(/Level 89 Paladin · Softcore/);
    expect(screen.getByRole("link", { name: "MC-MEEKS" }).getAttribute("href")).toBe("/builds/account?name=MC-MEEKS&season=14");
    expect(screen.getByRole("link", { name: "View on projectdiablo2.com" }).getAttribute("href")).toBe("https://www.projectdiablo2.com/character/Alli_pal");
    expect(document.body.textContent).toMatch(/Gear\s*12\.3 HR\+/);
    expect(document.body.textContent).toMatch(/Merc\s*1\.20 HR/);
    expect(document.body.textContent).toMatch(/Updated 3h ago/);
  });

  it("unknown character shows Character not found with a link back", async () => {
    mockApi({ status: 404 });
    render(<CharacterView />);
    expect(await screen.findByText("Character not found")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Builds/ }).getAttribute("href")).toBe("/builds");
  });

  it("missing name shows the same card", () => {
    search = "season=14";
    mockApi();
    render(<CharacterView />);
    expect(screen.getByText("Character not found")).toBeTruthy();
  });
});

const info = (over: Partial<HeaderInfo> = {}): HeaderInfo => ({
  name: "Alli_pal", className: "Paladin", level: 89, mode: "softcore", season: 14, seasonName: null,
  account: "MC-MEEKS", lastIngestedAt: new Date().toISOString(), gearValueHr: null, gearPartial: false, mercValueHr: null, ...over,
});

describe("refresh", () => {
  it("shows the queued text on 200", async () => {
    const f = mockApi({ queue: 200 });
    render(<CharacterHeader info={info()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Queued. Fresh data within a few minutes.")).toBeTruthy();
    expect(JSON.parse(String((f.mock.calls[0][1] as RequestInit).body))).toEqual({ accountName: "MC-MEEKS" });
  });
  it("shows the rate-limit text on 429", async () => {
    mockApi({ queue: 429 });
    render(<CharacterHeader info={info()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Too many requests, try again later.")).toBeTruthy();
  });
  it("is disabled without an account", () => {
    render(<CharacterHeader info={info({ account: null })} />);
    const b = screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("Account unknown");
    expect(screen.queryByRole("link", { name: "MC-MEEKS" })).toBeNull();
  });
});

// jsdom has no PointerEvent, so pointerType is set by hand.
const typed = <E extends Event>(e: E, pointerType: string): E => {
  Object.defineProperty(e, "pointerType", { value: pointerType });
  return e;
};

describe("equipment", () => {
  const items = ladder.items as unknown as RawItem[];
  const merc = ladder.mercenary.items as unknown as RawItem[];
  const prices = { "Nightwing's Veil": null, Azurewrath: { medianHr: 0.34, samples: 12, source: "sold" as const } };

  it("shows item art, tooltip on focus and No price yet", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    expect(screen.getByAltText("Nightwing's Veil")).toBeTruthy();
    const cell = screen.getByRole("button", { name: "Helm: Nightwing's Veil" });
    act(() => cell.focus());
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(tip.textContent).toContain(items.find((i) => i.name === "Nightwing's Veil")!.properties![0]);
    expect(tip.textContent).toContain("No price yet");
  });
  it("prices and corrupted marker", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    act(() => screen.getByRole("button", { name: "Right Hand: Azurewrath" }).focus());
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("0.34 HR (median of 12 sold)");
    expect(within(tip).getByText("Corrupted").className).toContain("text-danger");
  });
  it("toggles to the mercenary", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    fireEvent.click(screen.getByRole("button", { name: "Merc" }));
    expect(screen.getByRole("button", { name: "Helm: Sage's Defiance" })).toBeTruthy();
    expect(screen.queryByAltText("Nightwing's Veil")).toBeNull();
  });
  it("lists charms below, unique and set first", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    expect(screen.getByText("Charms")).toBeTruthy();
    const strip = screen.getByText("Charms").parentElement!;
    const labels = within(strip).getAllByRole("button").map((b) => b.getAttribute("aria-label")!);
    const kind = (n: string) => items.find((i) => i.name === n)!.quality!.name ?? "";
    const special = labels.filter((n) => ["Unique", "Set"].includes(kind(n)));
    expect(special.length).toBeGreaterThan(0);
    expect(labels.length).toBeGreaterThan(special.length);
    const firstPlain = labels.findIndex((n) => !["Unique", "Set"].includes(kind(n)));
    expect(labels.slice(0, firstPlain).length).toBe(special.length);
  });
  it("click keeps the tooltip open, a second click and Escape close it", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    const cell = screen.getByRole("button", { name: "Helm: Nightwing's Veil" });
    fireEvent.click(cell);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.click(cell);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("a mouse click after hover leaves the tooltip open; outside pointerdown closes", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    const cell = screen.getByRole("button", { name: "Helm: Nightwing's Veil" });
    // jsdom has no PointerEvent, so pointerType is set by hand.
    const enter = createEvent.pointerEnter(cell.parentElement!);
    Object.defineProperty(enter, "pointerType", { value: "mouse" });
    fireEvent(cell.parentElement!, enter);
    const down = createEvent.pointerDown(cell);
    Object.defineProperty(down, "pointerType", { value: "mouse" });
    fireEvent(cell, down);
    fireEvent.click(cell);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("touch tap opens, a second tap closes", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    const cell = screen.getByRole("button", { name: "Helm: Nightwing's Veil" });
    const tap = () => {
      fireEvent(cell, typed(createEvent.pointerDown(cell), "touch"));
      fireEvent.click(cell);
    };
    tap();
    expect(screen.getByRole("tooltip")).toBeTruthy();
    tap();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("full Chrome Android touch order: leave fires before focus and click", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    const cell = screen.getByRole("button", { name: "Helm: Nightwing's Veil" });
    const tap = () => {
      fireEvent(cell, typed(createEvent.pointerDown(cell), "touch"));
      fireEvent(cell, typed(createEvent.pointerUp(cell), "touch"));
      fireEvent(cell, typed(createEvent.pointerOut(cell), "touch"));
      fireEvent(cell, typed(createEvent.pointerLeave(cell), "touch"));
      act(() => cell.focus());
      fireEvent.click(cell);
    };
    tap();
    expect(screen.getByRole("tooltip")).toBeTruthy();
    tap();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("mouse hover opens and closes without a click", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    const cell = screen.getByRole("button", { name: "Helm: Nightwing's Veil" });
    fireEvent(cell, typed(createEvent.pointerOver(cell), "mouse"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent(cell, typed(createEvent.pointerOut(cell), "mouse"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("a cancelled touch press does not block keyboard focus", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    const cell = screen.getByRole("button", { name: "Helm: Nightwing's Veil" });
    fireEvent(cell, typed(createEvent.pointerDown(cell), "touch"));
    fireEvent(cell, typed(createEvent.pointerCancel(cell), "touch"));
    act(() => cell.focus());
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
  it("merc view has no amulet or ring wells", () => {
    render(<EquipmentGrid items={items} mercItems={merc} prices={prices} />);
    expect(screen.getByRole("button", { name: /^Amulet:/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Merc" }));
    expect(screen.queryByRole("button", { name: /^Amulet:/ })).toBeNull();
    expect(screen.queryByText("Right Ring")).toBeNull();
  });
});

describe("panels", () => {
  it("skills sort by real level and hide zero levels", () => {
    render(
      <SkillsPanel
        realSkills={[{ skill: "Sacrifice", level: 7 }, { skill: "Resist Cold", level: 34, baseLevel: 20 }]}
        skills={[{ name: "Sacrifice", level: 7 }, { name: "Resist Cold", level: 20 }, { name: "Prayer", level: 0 }]}
      />,
    );
    const rows = screen.getAllByTestId("skill-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Resist Cold");
    expect(rows[0].textContent).toContain("34(20)");
  });
  it("negative resistance is danger", () => {
    render(<StatsPanel stats={stats()} life={1480} mana={285} />);
    expect(screen.getByText("-20/75").className).toContain("text-danger");
    expect(screen.getAllByText("75/75")[0].className).not.toContain("text-danger");
  });
  it("stats null", () => {
    render(<StatsPanel stats={null} life={1} mana={1} />);
    expect(screen.getByText("Stats unavailable for this character.")).toBeTruthy();
  });
  it("level chart labels both levels", () => {
    render(<LevelChart history={history.history} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Level 85 on Oct 24 to 95 on Oct 29");
  });
  it("level chart with one row", () => {
    render(<LevelChart history={history.history.slice(0, 1)} />);
    expect(screen.getByText("Not enough history yet.")).toBeTruthy();
  });
});
