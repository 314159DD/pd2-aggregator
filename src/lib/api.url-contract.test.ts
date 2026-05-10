import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getItemUsage,
  getSkillUsage,
  getMercTypeUsage,
  getMercItemUsage,
  getLevelDistribution,
} from "./api";

// Captures every URL the api.ts functions fetch, without hitting the network.
// Asserts the contract: when a non-empty skills array is passed, the URL must
// include a `skills=` JSON-encoded query parameter. When skills is omitted, the
// URL must NOT include `skills=`. This would have failed loudly when Sprint 2.1
// shipped — our endpoints were being called without skills and we never noticed
// until users compared our output to pd2.tools' UI.

describe("api.ts URL contract", () => {
  let capturedUrls: string[];

  beforeEach(() => {
    capturedUrls = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrls.push(url);
      return Promise.resolve(
        new Response(JSON.stringify([]), { status: 200 }),
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const FILTER = {
    gameMode: "hardcore" as const,
    className: "Amazon",
    minLevel: 80,
  };
  const SKILLS = [{ name: "Lightning Fury", minLevel: 20 }];

  describe("when skills array is non-empty", () => {
    it("getItemUsage URL includes skills= JSON-encoded", async () => {
      await getItemUsage(FILTER, SKILLS);
      expect(capturedUrls).toHaveLength(1);
      const params = new URL(capturedUrls[0]).searchParams;
      const raw = params.get("skills");
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual(SKILLS);
    });

    it("getSkillUsage URL includes skills= JSON-encoded", async () => {
      await getSkillUsage(FILTER, SKILLS);
      expect(JSON.parse(new URL(capturedUrls[0]).searchParams.get("skills")!))
        .toEqual(SKILLS);
    });

    it("getMercTypeUsage URL includes skills= JSON-encoded", async () => {
      await getMercTypeUsage(FILTER, SKILLS);
      expect(JSON.parse(new URL(capturedUrls[0]).searchParams.get("skills")!))
        .toEqual(SKILLS);
    });

    it("getMercItemUsage URL includes skills= JSON-encoded", async () => {
      await getMercItemUsage(FILTER, SKILLS);
      expect(JSON.parse(new URL(capturedUrls[0]).searchParams.get("skills")!))
        .toEqual(SKILLS);
    });

    it("getLevelDistribution URL includes skills= JSON-encoded", async () => {
      await getLevelDistribution(
        { gameMode: FILTER.gameMode, className: FILTER.className },
        SKILLS,
      );
      expect(JSON.parse(new URL(capturedUrls[0]).searchParams.get("skills")!))
        .toEqual(SKILLS);
    });
  });

  describe("when skills array is omitted or empty", () => {
    it("getItemUsage URL omits skills=", async () => {
      await getItemUsage(FILTER);
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });

    it("getItemUsage URL omits skills= for explicit empty array", async () => {
      await getItemUsage(FILTER, []);
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });

    it("getSkillUsage URL omits skills=", async () => {
      await getSkillUsage(FILTER);
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });

    it("getMercTypeUsage URL omits skills=", async () => {
      await getMercTypeUsage(FILTER);
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });

    it("getMercItemUsage URL omits skills=", async () => {
      await getMercItemUsage(FILTER);
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });

    it("getLevelDistribution URL omits skills=", async () => {
      await getLevelDistribution({
        gameMode: FILTER.gameMode,
        className: FILTER.className,
      });
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });
  });

  describe("baseline params always present", () => {
    it("includes gameMode + classes + minLevel for getItemUsage", async () => {
      await getItemUsage(FILTER, SKILLS);
      const params = new URL(capturedUrls[0]).searchParams;
      expect(params.get("gameMode")).toBe("hardcore");
      expect(params.get("classes")).toBe("Amazon");
      expect(params.get("minLevel")).toBe("80");
    });
  });
});
