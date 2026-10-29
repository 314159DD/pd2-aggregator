import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => "/builds",
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

import { BuildsView } from "./BuildsView";
import { Sparkline } from "@/components/lx/Sparkline";

const usage = (seasonTotal: number, total: number) => ({
  seasonTotal,
  total,
  breakdown: { Amazon: 100, Assassin: 200, Barbarian: 300, Druid: 400, Necromancer: 500, Paladin: 2210, Sorceress: 600, total: total === 0 ? 0 : 4310 },
  skills: [],
  items: [],
  mercTypes: [],
  mercItems: [],
});
const characters = (total: number) => ({ total, page: 1, pageSize: 25, pages: 1, sort: "level", dir: "desc", characters: [] });
const history = {
  days: [
    { day: "2026-10-20", total: 100, classes: { Paladin: 17 } },
    { day: "2026-10-22", total: 100, classes: { Paladin: 18 } },
    { day: "2026-10-23", total: 100, classes: { Paladin: 18 } },
  ],
};

function mockApi(seasonTotal = 12293, total = 12293) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const body = u.includes("/builds/usage")
        ? usage(seasonTotal, total)
        : u.includes("/builds/characters")
          ? characters(total)
          : u.includes("/builds/history")
            ? history
            : { current: 14, seasons: [{ season: 14, name: "Alliance", current: true, characters: { softcore: 1, hardcore: 1 } }] };
      return { ok: true, status: 200, json: async () => body };
    }),
  );
}

const lastUrl = () => String(replace.mock.calls.at(-1)?.[0]);

beforeEach(() => {
  search = "";
  replace.mockClear();
  mockApi();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Builds frame", () => {
  it("shows season, mode and the character count in the header", async () => {
    render(<BuildsView />);
    expect(await screen.findByText("12,293")).toBeInTheDocument();
    expect(screen.getByText(/Alliance \(S14\) · Softcore/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Builds" })).toBeInTheDocument();
  });

  it("clicking the Paladin tile sets classes without page", async () => {
    search = "page=3";
    render(<BuildsView />);
    fireEvent.click(await screen.findByRole("button", { name: /^Paladin/ }));
    expect(lastUrl()).toContain("classes=Paladin");
    expect(lastUrl()).not.toContain("page=");
  });

  it("marks the selected class and shows its chip and Open in Meta link", async () => {
    search = "classes=Paladin";
    render(<BuildsView />);
    expect(await screen.findByRole("button", { name: /^Paladin/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Amazon/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Remove Paladin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Meta" }).getAttribute("href")).toContain("className=Paladin");
  });

  it("Clear filters drops classes but keeps the game mode", async () => {
    search = "classes=Paladin&gameMode=hardcore";
    render(<BuildsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear filters" }));
    expect(lastUrl()).not.toContain("classes");
    expect(lastUrl()).toContain("gameMode=hardcore");
  });

  it("the level preset 90+ sets minLevel=90", async () => {
    render(<BuildsView />);
    fireEvent.click(await screen.findByRole("button", { name: "90+" }));
    expect(lastUrl()).toContain("minLevel=90");
  });

  it("the budget slider updates its label at once and the URL after 250 ms", async () => {
    render(<BuildsView />);
    const slider = await screen.findByRole("slider");
    expect(slider).toHaveAttribute("aria-valuetext", "Any");
    vi.useFakeTimers();
    fireEvent.change(slider, { target: { value: "4" } });
    expect(slider).toHaveAttribute("aria-valuetext", "≤ 2.00 HR");
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(lastUrl()).toContain("maxGearHr=2");
  });

  it("renders 0 characters without throwing when nothing matches", async () => {
    mockApi(0, 0);
    render(<BuildsView />);
    expect(await screen.findByRole("button", { name: /All classes/ })).toBeInTheDocument();
    expect(screen.getByText(/Softcore/)).toHaveTextContent("Softcore · 0 characters");
  });

  it("shows an inline error with Retry when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    render(<BuildsView />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not load builds."));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("gives each class tile a sparkline labelled with its share over the day span", async () => {
    render(<BuildsView />);
    expect(await screen.findByRole("img", { name: "Paladin share over 4 days, 17% to 18%" })).toBeInTheDocument();
  });
});

describe("Sparkline", () => {
  it("renders nothing with fewer than two values", () => {
    const { container } = render(<Sparkline values={[3]} label="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("plots by x position so gaps stay gaps", () => {
    render(<Sparkline values={[1, 2, 3]} xs={[0, 1, 9]} label="gap" />);
    const pts = screen.getByRole("img", { name: "gap" }).querySelector("polyline")!.getAttribute("points")!.split(" ");
    const x = pts.map((p) => Number(p.split(",")[0]));
    expect(x[1] - x[0]).toBeLessThan(x[2] - x[1]);
  });
});
