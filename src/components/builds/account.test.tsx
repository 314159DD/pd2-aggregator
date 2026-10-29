import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AccountView } from "./AccountView";
import { AddAccount } from "./AddAccount";

let search = "name=Acc1&season=14";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const ch = (name: string, hardcore = false) => ({
  character: { name, level: 95, class: { name: "Paladin" }, status: { is_hardcore: hardcore } },
  accountName: "Acc1",
  lastUpdated: Date.now() - 3 * 3600 * 1000,
});

afterEach(() => vi.unstubAllGlobals());

describe("AccountView", () => {
  it("lists characters with raw-name links and masked labels", async () => {
    search = "name=Acc1&season=14";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 2, characters: [ch("ShitLord", true), ch("Hero")] }))));
    render(<AccountView />);
    await waitFor(() => expect(screen.getAllByRole("link", { name: /Level 95 Paladin/ })).toHaveLength(2));
    const links = screen.getAllByRole("link", { name: /Level 95 Paladin/ });
    expect(links[0].getAttribute("href")).toBe("/builds/character?name=ShitLord&season=14&gameMode=hardcore");
    expect(links[1].getAttribute("href")).toBe("/builds/character?name=Hero&season=14&gameMode=softcore");
    expect(screen.queryByText("ShitLord")).toBeNull();
    expect(screen.getByText("S*******")).toBeTruthy();
    expect(screen.getByText("Hardcore")).toBeTruthy();
    expect(screen.getByText("2 characters this season")).toBeTruthy();
    expect(screen.getAllByText("Updated 3h ago").length).toBe(2);
  });

  it("shows the empty text and a prefilled form for an unknown account", async () => {
    search = "name=Nobody";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 0, characters: [] }))));
    render(<AccountView />);
    await waitFor(() => expect(screen.getByText("No tracked characters for this account yet.")).toBeTruthy());
    expect((screen.getByLabelText("Account name") as HTMLInputElement).value).toBe("Nobody");
  });
});

describe("AddAccount", () => {
  it("rejects an invalid name without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AddAccount initial="a b" />);
    fireEvent.click(screen.getByRole("button", { name: "Track account" }));
    expect(await screen.findByText("Account names use letters, numbers, _ and - only.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the queued text on 200 and the rate-limit text on 429", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AddAccount initial="mc-meeks" />);
    fireEvent.click(screen.getByRole("button", { name: "Track account" }));
    expect(await screen.findByText("Queued. Characters appear within a few minutes.")).toBeTruthy();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    fireEvent.click(screen.getByRole("button", { name: "Track account" }));
    expect(await screen.findByText("Too many requests, try again later.")).toBeTruthy();
  });
});
