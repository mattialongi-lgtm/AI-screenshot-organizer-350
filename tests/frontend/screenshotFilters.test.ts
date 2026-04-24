// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ScreenshotMetadata } from "../../src/types";
import {
  applyStructuredFilters,
  getScreenshotsByIds,
} from "../../src/lib/screenshotFilters";

const baseShot = (over: Partial<ScreenshotMetadata>): ScreenshotMetadata => ({
  id: "1",
  createdAt: 0,
  filename: "a.png",
  ocrText: "",
  summary: "",
  category: "Other",
  tags: [],
  entities: {
    dates: [],
    amounts: [],
    emails: [],
    urls: [],
    phones: [],
    order_ids: [],
  },
  source: "upload",
  isAnalyzed: true,
  ...over,
});

describe("getScreenshotsByIds", () => {
  it("preserves order and drops unknown ids", () => {
    const shots = [
      baseShot({ id: "a" }),
      baseShot({ id: "b" }),
      baseShot({ id: 3 }),
    ];

    const result = getScreenshotsByIds(shots, [3, "a", "missing"]);

    expect(result.map((s) => String(s.id))).toEqual(["3", "a"]);
  });

  it("returns empty array for empty input", () => {
    expect(getScreenshotsByIds([], [])).toEqual([]);
    expect(getScreenshotsByIds([baseShot({ id: "x" })], [])).toEqual([]);
  });
});

describe("applyStructuredFilters", () => {
  const shots = [
    baseShot({ id: "1", category: "Receipt", entities: { ...baseShot({}).entities, amounts: ["$12"] } }),
    baseShot({ id: "2", category: "Email", entities: { ...baseShot({}).entities, urls: ["https://x"] } }),
    baseShot({ id: "3", category: "Receipt" }),
  ];

  it("returns all screenshots when filters are inactive", () => {
    expect(
      applyStructuredFilters(shots, {
        activeCategory: "All",
        hasAmount: false,
        hasUrl: false,
      }),
    ).toHaveLength(3);
  });

  it("filters by category", () => {
    const result = applyStructuredFilters(shots, {
      activeCategory: "Receipt",
      hasAmount: false,
      hasUrl: false,
    });
    expect(result.map((s) => s.id)).toEqual(["1", "3"]);
  });

  it("filters by amount presence", () => {
    const result = applyStructuredFilters(shots, {
      activeCategory: "All",
      hasAmount: true,
      hasUrl: false,
    });
    expect(result.map((s) => s.id)).toEqual(["1"]);
  });

  it("filters by url presence", () => {
    const result = applyStructuredFilters(shots, {
      activeCategory: "All",
      hasAmount: false,
      hasUrl: true,
    });
    expect(result.map((s) => s.id)).toEqual(["2"]);
  });
});
