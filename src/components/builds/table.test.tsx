import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { CharacterTable } from "./CharacterTable";
import { DEFAULT_BUILDS_STATE } from "@/lib/builds/url-state";
import type { BuildRow, BuildsCharactersPage, CharacterPreview } from "@/lib/builds/types";

const row = (i: number, over: Partial<BuildRow> = {}): BuildRow => ({
  name: `Hero${i}`,
  className: "Paladin",
  level: 90 + (i % 9),
  life: 2000 + i,
  account: null,
  topSkills: [{ name: "Blessed Hammer", hardLevel: 20, realLevel: 34 }],
  keyGear: [{ name: "Enigma", itemType: "Runeword", invCode: null, baseType: null }],
  gearValueHr: 1.5,
  gearValuePartial: false,
  ...over,
});
const page = (over: Partial<BuildsCharactersPage> = {}): BuildsCharactersPage => ({
  total: 12294,
  page: 1,
  pageSize: 25,
  pages: 492,
  sort: "level",
  dir: "desc",
  characters: Array.from({ length: 25 }, (_, i) => row(i)),
  ...over,
});

const preview = (name: string): CharacterPreview => ({
  name,
  className: "Paladin",
  level: 95,
  life: 2500,
  mana: 300,
  attributes: { strength: 100, dexterity: 80, vitality: 200, energy: 50 },
  skills: [{ name: "Blessed Hammer", hardLevel: 20, realLevel: 34 }],
  gear: [{ name: "Enigma", itemType: "Runeword", quality: "Runeword", slot: "Armor", isSwitch: false, isCharm: false, invCode: null, baseType: null, medianHr: 2.5 }],
  gearValueHr: 2.5,
  gearValuePartial: false,
  mercGearValueHr: null,
  merc: { type: "Fire Arrow", act: 2, items: [] },
});

afterEach(() => vi.unstubAllGlobals());

describe("CharacterTable", () => {
  it("renders 25 rows, masks profane names but links with the raw name", () => {
    const characters = Array.from({ length: 25 }, (_, i) => row(i, i === 0 ? { name: "shitlord" } : {}));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(preview("shitlord"))));
    vi.stubGlobal("fetch", fetchMock);
    render(<CharacterTable page={page({ characters })} state={DEFAULT_BUILDS_STATE} onChange={() => {}} />);
    expect(screen.getAllByRole("row", { expanded: false })).toHaveLength(25);
    expect(screen.queryByText("shitlord")).toBeNull();
    expect(screen.getByText("s*******")).toBeTruthy();
    expect(screen.getByText("12,294 characters match")).toBeTruthy();
  });

  it("uses the raw encoded name in the Full character link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(preview("shit lord")))));
    render(
      <CharacterTable page={page({ characters: [row(0, { name: "shit lord" })] })} state={{ ...DEFAULT_BUILDS_STATE, season: 14, gameMode: "hardcore" }} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByText("s********"));
    const link = await screen.findByRole("link", { name: /Full character/ });
    expect(link.getAttribute("href")).toBe("/builds/character?name=shit%20lord&season=14&gameMode=hardcore");
  });

  it("sorts through the header buttons and exposes aria-sort", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CharacterTable page={page()} state={DEFAULT_BUILDS_STATE} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Life/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: "life", dir: "desc", page: 1 }));
    expect(screen.getByRole("columnheader", { name: /Life/ }).getAttribute("aria-sort")).toBe("none");
    rerender(<CharacterTable page={page({ sort: "life", dir: "desc" })} state={{ ...DEFAULT_BUILDS_STATE, sort: "life" }} onChange={onChange} />);
    expect(screen.getByRole("columnheader", { name: /Life/ }).getAttribute("aria-sort")).toBe("descending");
  });

  it("pages with Prev and Next", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CharacterTable page={page({ page: 2, pages: 3 })} state={{ ...DEFAULT_BUILDS_STATE, page: 2 }} onChange={onChange} />);
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    const prev = screen.getByRole("button", { name: /Prev/ }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: /Next/ }) as HTMLButtonElement;
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }));
    rerender(<CharacterTable page={page({ page: 1, pages: 3 })} state={DEFAULT_BUILDS_STATE} onChange={onChange} />);
    expect((screen.getByRole("button", { name: /Prev/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders partial gear value with a plus and a dash for null", () => {
    const characters = [row(0, { gearValueHr: 4.3, gearValuePartial: true }), row(1, { gearValueHr: null, keyGear: [] })];
    render(<CharacterTable page={page({ characters })} state={DEFAULT_BUILDS_STATE} onChange={() => {}} />);
    expect(screen.getByText("4.30+")).toBeTruthy();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
  });

  it("opens one preview at a time, fetching once per open", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const name = decodeURIComponent(url.split("/builds/characters/")[1].split("?")[0]);
      return new Response(JSON.stringify(preview(name)));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CharacterTable page={page()} state={DEFAULT_BUILDS_STATE} onChange={() => {}} />);
    const rows = screen.getAllByRole("row", { expanded: false });
    fireEvent.click(rows[0]);
    expect(rows[0].getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByText("Full character ›")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/builds/characters/Hero0?");

    fireEvent.click(rows[1]);
    await waitFor(() => expect(rows[0].getAttribute("aria-expanded")).toBe("false"));
    expect(rows[1].getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Full character ›")).toHaveLength(1);
  });

  it("toggles with Enter and shows a failure message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    render(<CharacterTable page={page({ characters: [row(0)] })} state={DEFAULT_BUILDS_STATE} onChange={() => {}} />);
    const r = screen.getAllByRole("row")[1];
    fireEvent.keyDown(r, { key: "Enter" });
    expect(await screen.findByText("Could not load this character.")).toBeTruthy();
    fireEvent.keyDown(r, { key: " " });
    expect(r.getAttribute("aria-expanded")).toBe("false");
    expect(within(r).queryByText("Full character ›")).toBeNull();
  });

  it("shows the empty state", () => {
    render(<CharacterTable page={page({ total: 0, page: 1, pages: 1, characters: [] })} state={DEFAULT_BUILDS_STATE} onChange={() => {}} />);
    expect(screen.getByText("No characters match these filters.")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });
});
