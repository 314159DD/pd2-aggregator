import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

let search = "";
const listeners = new Set<() => void>();
const applyUrl = (url: string) => {
  search = url.split("?")[1] ?? "";
  listeners.forEach((l) => l());
};
const replace = vi.fn(applyUrl);
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => "/",
    useSearchParams: () => {
      const s = React.useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => search,
        () => search,
      );
      return new URLSearchParams(s);
    },
    useRouter: () => ({ replace, push: vi.fn() }),
  };
});

import { MetaView } from "./MetaView";

const cohort = (poolSize: number, basePoolSize = 5678) => ({
  season: 14,
  mode: "softcore",
  className: "Paladin",
  minLevel: 85,
  skills: [],
  poolSize,
  basePoolSize,
  pricesComputedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
});

const SKILL_ROWS = ["Blessed Hammer", "Concentration", "Vigor"].map((name, i) => ({ name, numOccurrences: 10 - i, totalSample: 10, pct: 90 - i * 10 }));

let metaCalls: string[] = [];
let diffCalls: string[] = [];
let metaSignals: AbortSignal[] = [];
let skillFails = false;
let metaImpl: (url: string) => Promise<unknown>;

function mockApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      let body: unknown;
      if (u.includes("/meta/diff?")) {
        diffCalls.push(u);
        body = { diff: { slots: [] } };
      } else if (u.includes("/meta?")) {
        metaCalls.push(u);
        if (init?.signal) metaSignals.push(init.signal);
        body = await metaImpl(u);
      } else if (u.includes("skill-usage")) {
        if (skillFails) throw new Error("skills down");
        body = SKILL_ROWS;
      }
      else if (u.includes("/builds/seasons")) body = { current: 14, seasons: [{ season: 14, name: "Alliance", current: true }] };
      else body = {};
      return { ok: true, status: 200, json: async () => body };
    }),
  );
}

const flush = () => act(async () => {});
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  vi.useFakeTimers();
  search = "className=Paladin&gameMode=hardcore&minLevel=85";
  replace.mockReset();
  replace.mockImplementation(applyUrl);
  listeners.clear();
  metaCalls = [];
  diffCalls = [];
  metaSignals = [];
  skillFails = false;
  metaImpl = async () => cohort(1234);
  mockApi();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const generate = () => fireEvent.click(screen.getByRole("button", { name: "Generate" }));
const lastUrl = () => String(replace.mock.calls.at(-1)?.[0]);
const skillButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name} ?[0-9]+%$`) });

describe("Meta page", () => {
  it("shows the old filter panel with Generate and Reset", async () => {
    render(<MetaView />);
    await advance(600);
    expect(screen.getByRole("button", { name: "Generate" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build a guide" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Diff my character" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hardcore" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Paladin" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Min character level/)).toBeTruthy();
  });

  it("changes nothing until Generate, then keeps both skills", async () => {
    render(<MetaView />);
    await advance(600);
    fireEvent.click(skillButton("Blessed Hammer"));
    fireEvent.click(skillButton("Vigor"));
    expect(replace).not.toHaveBeenCalled();
    generate();
    expect(decodeURIComponent(lastUrl().replace(/\+/g, " "))).toContain("Blessed Hammer");
    expect(decodeURIComponent(lastUrl().replace(/\+/g, " "))).toContain("Vigor");
  });

  it("aborts a superseded cohort request", async () => {
    metaImpl = () => new Promise(() => {});
    render(<MetaView />);
    await advance(350);
    expect(metaSignals).toHaveLength(1);
    expect(metaSignals[0].aborted).toBe(false);
    act(() => replace("/?className=Paladin&gameMode=hardcore&minLevel=90"));
    await advance(350);
    expect(metaSignals).toHaveLength(2);
    expect(metaSignals[0].aborted).toBe(true);
    expect(metaSignals[1].aborted).toBe(false);
  });

  it("applies the diff name with Generate", async () => {
    search = "className=Paladin&mode=diff";
    render(<MetaView />);
    await advance(400);
    const input = screen.getByLabelText("Character or account name");
    fireEvent.change(input, { target: { value: "Bar" } });
    fireEvent.submit(input.closest("form")!);
    expect(lastUrl()).toContain("char=Bar");
  });

  it("hides the count card next to the retry alert", async () => {
    render(<MetaView />);
    await advance(400);
    expect(screen.getByTestId("cohort-count")).toBeTruthy();
    metaImpl = async () => {
      throw new Error("boom");
    };
    act(() => replace("/?className=Paladin&gameMode=hardcore&minLevel=90"));
    await advance(400);
    expect(screen.getByText("Could not load the meta.")).toBeTruthy();
    expect(screen.queryByTestId("cohort-count")).toBeNull();
  });

  it("shows a retry when the skill list fails", async () => {
    skillFails = true;
    render(<MetaView />);
    await advance(600);
    expect(screen.getByText("Could not load the skills.")).toBeTruthy();
    skillFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry skills" }));
    await advance(400);
    expect(skillButton("Vigor")).toBeTruthy();
  });

  it("requests /meta once after 300 ms and prints the old Characters found card", async () => {
    render(<MetaView />);
    await advance(299);
    expect(metaCalls).toHaveLength(0);
    await advance(2);
    expect(metaCalls).toHaveLength(1);
    expect(metaCalls[0]).toContain("classes=Paladin");
    expect(metaCalls[0]).toContain("minLevel=85");
    expect(metaCalls[0]).toContain("gameMode=hardcore");
    expect(screen.getByText("Characters found")).toBeTruthy();
    expect(screen.getByTestId("cohort-count").textContent).toBe("1,234");
    expect(screen.getByText(/level ≥ 85/)).toBeTruthy();
    expect(screen.getByText(/Prices updated 3m ago/)).toBeTruthy();
  });

  it("sends no request for skill clicks until Generate", async () => {
    render(<MetaView />);
    await advance(600);
    metaCalls = [];
    for (const n of ["Blessed Hammer", "Concentration", "Vigor"]) {
      fireEvent.click(skillButton(n));
      await advance(50);
    }
    await advance(400);
    expect(metaCalls).toHaveLength(0);
    generate();
    await advance(400);
    expect(metaCalls).toHaveLength(1);
    expect(metaCalls[0]).toContain("Vigor");
  });

  it("ignores a slow first response that resolves after a faster second one", async () => {
    let releaseSlow: (v: unknown) => void = () => {};
    metaImpl = (url) => (url.includes("minLevel=85") ? new Promise((r) => (releaseSlow = r)) : Promise.resolve(cohort(222)));
    render(<MetaView />);
    await advance(350);
    act(() => replace("/?className=Paladin&gameMode=hardcore&minLevel=90"));
    await advance(350);
    expect(screen.getByTestId("cohort-count").textContent).toBe("222");
    await act(async () => releaseSlow(cohort(111)));
    await flush();
    expect(screen.getByTestId("cohort-count").textContent).toBe("222");
  });

  it("switches class and clears skills on Generate", async () => {
    search = 'className=Paladin&skills=[{"name":"Vigor","minLevel":20}]';
    render(<MetaView />);
    await advance(600);
    fireEvent.click(screen.getByRole("button", { name: "Sorceress" }));
    expect(replace).not.toHaveBeenCalled();
    generate();
    expect(lastUrl()).toContain("className=Sorceress");
    expect(lastUrl()).not.toContain("skills");
  });

  it("a preset fills the skills and clicking it again clears them", async () => {
    render(<MetaView />);
    await advance(600);
    const presets = within(screen.getByRole("group", { name: "Presets" }));
    const first = presets.getAllByRole("button")[0];
    expect(first.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(first);
    expect(first.getAttribute("aria-pressed")).toBe("true");
    generate();
    expect(lastUrl()).toContain("skills=");
    fireEvent.click(first);
    expect(first.getAttribute("aria-pressed")).toBe("false");
    generate();
    expect(lastUrl()).not.toContain("skills");
  });

  it("applies the min level with Generate", async () => {
    render(<MetaView />);
    await advance(400);
    const range = screen.getByRole("slider");
    expect(range.getAttribute("aria-valuetext")).toBe("Level 85+");
    fireEvent.change(range, { target: { value: "90" } });
    expect(range.getAttribute("aria-valuetext")).toBe("Level 90+");
    expect(replace).not.toHaveBeenCalled();
    generate();
    expect(lastUrl()).toContain("minLevel=90");
  });

  it("diff mode requests /meta/diff after Generate", async () => {
    search = "className=Paladin&mode=diff";
    render(<MetaView />);
    await advance(400);
    fireEvent.change(screen.getByLabelText("Character or account name"), { target: { value: "Foo" } });
    await advance(400);
    expect(diffCalls).toHaveLength(0);
    generate();
    expect(lastUrl()).toContain("char=Foo");
    await advance(400);
    await advance(10);
    expect(diffCalls).toHaveLength(1);
  });

  it("shows the base pool with skills and links to the Builds tab", async () => {
    search = 'className=Paladin&skills=[{"name":"Vigor","minLevel":20}]';
    render(<MetaView />);
    await advance(400);
    expect(screen.getByTestId("cohort-count").textContent).toContain("of 5,678 Paladins");
    expect(screen.getByRole("link", { name: /See characters/ }).getAttribute("href")).toContain("classes=Paladin");
    expect(screen.getByRole("button", { name: "Remove Vigor" })).toBeTruthy();
  });

  it("game mode buttons apply at once and Reset returns to the defaults", async () => {
    search = "className=Sorceress&gameMode=hardcore&minLevel=90&season=13";
    render(<MetaView />);
    await advance(400);
    fireEvent.click(screen.getByRole("button", { name: "Softcore" }));
    expect(lastUrl()).toContain("gameMode=softcore");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(lastUrl()).toContain("className=Paladin");
    expect(lastUrl()).toContain("season=13");
    expect(lastUrl()).not.toContain("minLevel");
  });

  it("shows the zero state", async () => {
    metaImpl = async () => cohort(0);
    render(<MetaView />);
    await advance(400);
    expect(screen.getByTestId("cohort-count").textContent).toBe("0");
    expect(screen.getByText(/No characters match/)).toBeTruthy();
  });

  it("shows a retry when the request fails", async () => {
    metaImpl = async () => {
      throw new Error("boom");
    };
    render(<MetaView />);
    await advance(400);
    expect(screen.getByText("Could not load the meta.")).toBeTruthy();
    metaImpl = async () => cohort(5);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await advance(400);
    expect(screen.getByTestId("cohort-count").textContent).toBe("5");
  });

  it("renders an old link with skills=notjson", async () => {
    search = "skills=notjson&className=Wizard&minLevel=abc&mode=foo";
    render(<MetaView />);
    await advance(400);
    expect(metaCalls[0]).toContain("classes=Paladin");
    expect(metaCalls[0]).toContain("minLevel=80");
  });
});
