import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getSkillUsage } from "./api";

// getSkillUsage must send the skills filter as JSON, otherwise the endpoint
// aggregates the whole class instead of the chosen cohort.
describe("api.ts URL contract", () => {
  let capturedUrls: string[];

  beforeEach(() => {
    capturedUrls = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrls.push(url);
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const FILTER = { gameMode: "hardcore" as const, className: "Amazon", minLevel: 80 };
  const SKILLS = [{ name: "Lightning Fury", minLevel: 20 }];

  it("defaults to api.pd2meta.info when NEXT_PUBLIC_API_BASE is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE", undefined);
    vi.resetModules();
    const fresh = await import("./api");
    await fresh.getSkillUsage(FILTER);
    expect(capturedUrls[0]).toMatch(
      /^https:\/\/api\.pd2meta\.info\/api\/v1\/characters\/stats\/skill-usage\?/,
    );
  });

  it("includes skills= JSON-encoded when non-empty", async () => {
    await getSkillUsage(FILTER, SKILLS);
    expect(JSON.parse(new URL(capturedUrls[0]).searchParams.get("skills")!)).toEqual(SKILLS);
  });

  it("omits skills= when omitted or empty", async () => {
    await getSkillUsage(FILTER);
    await getSkillUsage(FILTER, []);
    expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    expect(new URL(capturedUrls[1]).searchParams.has("skills")).toBe(false);
  });

  it("maps className to classes and keeps minLevel", async () => {
    await getSkillUsage(FILTER);
    const p = new URL(capturedUrls[0]).searchParams;
    expect(p.get("classes")).toBe("Amazon");
    expect(p.get("minLevel")).toBe("80");
    expect(p.get("gameMode")).toBe("hardcore");
  });
});
