import { afterEach, describe, expect, it, vi } from "vitest";
import { getCharacter, getUsage, queueAccount } from "./api";
import { DEFAULT_BUILDS_STATE } from "./url-state";

const mockFetch = (status: number, body: unknown = {}) => {
  const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", f);
  return f;
};

afterEach(() => vi.unstubAllGlobals());

describe("builds api", () => {
  it("getCharacter resolves null on 404 and encodes the name", async () => {
    const f = mockFetch(404);
    await expect(getCharacter("Some Name", { season: null, gameMode: "softcore" })).resolves.toBeNull();
    expect(String(f.mock.calls[0][0])).toContain("/characters/Some%20Name?gameMode=softcore");
  });
  it("queueAccount maps statuses", async () => {
    mockFetch(429);
    await expect(queueAccount("abc")).resolves.toBe("rate-limited");
    mockFetch(400);
    await expect(queueAccount("!")).resolves.toBe("invalid");
    mockFetch(200, { queued: true });
    await expect(queueAccount("abc")).resolves.toBe("queued");
  });
  it("getUsage hits the default base", async () => {
    const f = mockFetch(200, { total: 0 });
    await getUsage(DEFAULT_BUILDS_STATE);
    expect(String(f.mock.calls[0][0])).toMatch(/^https:\/\/api\.pd2meta\.info\/api\/v1\/builds\/usage\?/);
  });
});
