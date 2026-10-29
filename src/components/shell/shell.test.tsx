import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

let pathname = "/builds";
let search = "gameMode=hardcore";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { SiteHeader } from "./SiteHeader";
import { ThemeToggle } from "./ThemeToggle";
import { Freshness } from "./Freshness";
import { SiteFooter } from "./SiteFooter";

function mockFetch(heartbeatAt: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).endsWith("/builds/seasons")
        ? {
            current: 14,
            seasons: [
              { season: 14, name: "Alliance", current: true, characters: { softcore: 1, hardcore: 1 } },
              { season: 13, name: "Ladder 13", current: false, characters: { softcore: 1, hardcore: 1 } },
            ],
          }
        : { season: 14, characters: { softcore: 2000, hardcore: 906 }, collector: {}, heartbeatAt };
      return { ok: true, json: async () => body };
    }),
  );
}

beforeEach(() => mockFetch(new Date(Date.now() - 3 * 60_000).toISOString()));
afterEach(() => {
  search = "gameMode=hardcore";
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.mode;
  localStorage.clear();
});

describe("SiteHeader", () => {
  it("on /builds marks Builds current and shows season select and mode segment", async () => {
    pathname = "/builds";
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Builds" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Meta" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("combobox", { name: "Season" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Game mode" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Alliance (S14) · current" })).toBeInTheDocument();
  });

  it("on / marks Meta current and shows season select and mode segment", () => {
    pathname = "/";
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Meta" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("group", { name: "Game mode" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Season" })).toBeInTheDocument();
  });

  it("on /builds/character renders no season select or mode segment", () => {
    pathname = "/builds/character";
    render(<SiteHeader />);
    expect(screen.queryByRole("group", { name: "Game mode" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Season" })).toBeNull();
  });

  it("treats /meta as the Meta tab and carries gameMode in both links", () => {
    pathname = "/meta";
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Meta" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Builds" })).toHaveAttribute("href", "/builds?gameMode=hardcore");
    expect(screen.getByRole("link", { name: "Meta" })).toHaveAttribute("href", "/?gameMode=hardcore");
  });
});

describe("TabNav Meta link", () => {
  it("on /builds without gameMode names softcore", () => {
    pathname = "/builds";
    search = "";
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Meta" })).toHaveAttribute("href", "/?gameMode=softcore");
  });

  it("on Meta keeps the whole URL state", () => {
    pathname = "/";
    search = "className=Paladin&minLevel=90&gameMode=softcore&char=Foo";
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Meta" })).toHaveAttribute("href", "/?className=Paladin&minLevel=90&gameMode=softcore&char=Foo");
    expect(screen.getByRole("link", { name: "Builds" })).toHaveAttribute("href", "/builds?gameMode=softcore");
  });
});

describe("ScopeSwitch", () => {
  it("falls back to the current season for an unknown ?season", async () => {
    pathname = "/builds";
    search = "season=99";
    render(<SiteHeader />);
    await screen.findByRole("option", { name: "Alliance (S14) · current" });
    expect(screen.getByRole("combobox", { name: "Season" })).toHaveValue("14");
  });
});

describe("ThemeToggle", () => {
  it("flips dark to light and stores the choice", () => {
    document.documentElement.dataset.mode = "dark";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.mode).toBe("light");
    expect(localStorage.getItem("pd2meta-theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
  });
});

describe("Freshness", () => {
  it("shows the stale state when the heartbeat is 20 minutes old", async () => {
    mockFetch(new Date(Date.now() - 20 * 60_000).toISOString());
    const { container } = render(<Freshness />);
    expect(await screen.findByText(/updated 20m ago/)).toBeInTheDocument();
    expect(container.querySelector("[data-stale]")).not.toBeNull();
    expect(screen.getByText("2,906")).toBeInTheDocument();
  });

  it("is not stale after 3 minutes", async () => {
    const { container } = render(<Freshness />);
    expect(await screen.findByText(/updated 3m ago/)).toBeInTheDocument();
    expect(container.querySelector("[data-stale]")).toBeNull();
    await act(async () => {});
  });
});

describe("SiteFooter", () => {
  it("renders the disclaimer and the pd2.tools credit link", () => {
    render(<SiteFooter />);
    expect(screen.getByText("Not affiliated with Project Diablo 2.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pd2\.tools/ })).toHaveAttribute("href", "https://github.com/coleestrin/pd2-tools");
  });
});
