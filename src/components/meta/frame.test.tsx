import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

let search = "";
const listeners = new Set<() => void>();
const replace = vi.fn((url: string) => {
  search = url.split("?")[1] ?? "";
  listeners.forEach((l) => l());
});
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
let metaImpl: (url: string) => Promise<unknown>;

function mockApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      let body: unknown;
      if (u.includes("/meta/diff?")) {
        diffCalls.push(u);
        body = { diff: { slots: [] } };
      } else if (u.includes("/meta?")) {
        metaCalls.push(u);
        body = await metaImpl(u);
      } else if (u.includes("skill-usage")) body = SKILL_ROWS;
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
  replace.mockClear();
  listeners.clear();
  metaCalls = [];
  diffCalls = [];
  metaImpl = async () => cohort(1234);
  mockApi();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Meta frame", () => {
  it("requests /meta once after 300 ms", async () => {
    render(<MetaView />);
    await advance(299);
    expect(metaCalls).toHaveLength(0);
    await advance(2);
    expect(metaCalls).toHaveLength(1);
    expect(metaCalls[0]).toContain("classes=Paladin");
    expect(metaCalls[0]).toContain("minLevel=85");
    expect(metaCalls[0]).toContain("gameMode=hardcore");
    expect(screen.getByTestId("cohort-count").textContent).toBe("1,234 characters match");
    expect(screen.getByText(/Prices updated 3m ago/)).toBeTruthy();
  });

  it("collapses three skill clicks within 300 ms into one request", async () => {
    render(<MetaView />);
    await advance(400);
    await advance(200); // skill list loaded
    metaCalls = [];
    for (const n of ["Blessed Hammer", "Concentration", "Vigor"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${n} [0-9]+%$`) }));
      await advance(50);
    }
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
    expect(screen.getByTestId("cohort-count").textContent).toBe("222 characters match");
    await act(async () => releaseSlow(cohort(111)));
    await flush();
    expect(screen.getByTestId("cohort-count").textContent).toBe("222 characters match");
  });

  it("switches class and clears skills", async () => {
    search = 'className=Paladin&skills=[{"name":"Vigor","minLevel":20}]';
    render(<MetaView />);
    await advance(400);
    fireEvent.click(screen.getByRole("button", { name: /Sorceress/ }));
    const url = String(replace.mock.calls.at(-1)?.[0]);
    expect(url).toContain("className=Sorceress");
    expect(url).not.toContain("skills");
  });

  it("clicking an active preset clears the skills", async () => {
    render(<MetaView />);
    await advance(400);
    const preset = screen.getAllByRole("button", { pressed: false }).find((b) => b.querySelector(".well") && /^[A-Z]/.test(b.textContent ?? "") && !/Paladin|Sorceress/.test(b.textContent ?? ""));
    expect(preset).toBeTruthy();
    fireEvent.click(preset!);
    expect(String(replace.mock.calls.at(-1)?.[0])).toContain("skills=");
    const active = screen.getAllByRole("button", { pressed: true }).find((b) => b.querySelector(".well"));
    expect(active).toBeTruthy();
    fireEvent.click(active!);
    expect(String(replace.mock.calls.at(-1)?.[0])).not.toContain("skills");
  });

  it("commits the min level 250 ms after the range changes", async () => {
    render(<MetaView />);
    await advance(400);
    const range = screen.getByRole("slider");
    expect(range.getAttribute("aria-valuetext")).toBe("Level 85+");
    fireEvent.change(range, { target: { value: "90" } });
    expect(range.getAttribute("aria-valuetext")).toBe("Level 90+");
    await advance(200);
    expect(replace).not.toHaveBeenCalled();
    await advance(100);
    expect(String(replace.mock.calls.at(-1)?.[0])).toContain("minLevel=90");
  });

  it("diff mode requests /meta/diff only after Compare", async () => {
    search = "className=Paladin&mode=diff";
    render(<MetaView />);
    await advance(400);
    fireEvent.change(screen.getByLabelText("Character or account name"), { target: { value: "Foo" } });
    await advance(400);
    expect(diffCalls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(String(replace.mock.calls.at(-1)?.[0])).toContain("char=Foo");
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
    expect(screen.getByRole("button", { name: "Clear skills" })).toBeTruthy();
  });

  it("has no Generate button and no mode control in the body", async () => {
    render(<MetaView />);
    await advance(400);
    expect(screen.queryByRole("button", { name: /Generate/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hardcore" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Softcore" })).toBeNull();
  });

  it("shows the zero state", async () => {
    metaImpl = async () => cohort(0);
    render(<MetaView />);
    await advance(400);
    expect(screen.getByTestId("cohort-count").textContent).toBe("0 characters match");
    expect(screen.getByText("Try fewer skills or a lower level.")).toBeTruthy();
  });

  it("shows a retry capsule when the request fails", async () => {
    metaImpl = async () => {
      throw new Error("boom");
    };
    render(<MetaView />);
    await advance(400);
    expect(screen.getByText("Could not load the meta.")).toBeTruthy();
    metaImpl = async () => cohort(5);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await advance(400);
    expect(screen.getByTestId("cohort-count").textContent).toBe("5 characters match");
  });

  it("renders an old link with skills=notjson", async () => {
    search = "skills=notjson&className=Wizard&minLevel=abc&mode=foo";
    render(<MetaView />);
    await advance(400);
    expect(metaCalls[0]).toContain("classes=Paladin");
    expect(metaCalls[0]).toContain("minLevel=80");
  });
});
