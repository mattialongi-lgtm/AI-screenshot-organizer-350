// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ScreenshotMetadata } from "../../src/types";

vi.mock("../../src/lib/ai/openai", () => ({
  generateEmbedding: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
  authenticatedFetch: vi.fn(),
}));

import { generateEmbedding } from "../../src/lib/ai/openai";
import { keywordSearch, semanticSearch } from "../../src/lib/search";

const shot = (over: Partial<ScreenshotMetadata> & { id: string }): ScreenshotMetadata => ({
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

describe("keywordSearch", () => {
  const shots = [
    shot({ id: "1", ocrText: "Order receipt $42", tags: ["shopping"], category: "Receipt" }),
    shot({ id: "2", summary: "Email from John", category: "Email" }),
    shot({ id: "3", ocrText: "Random", category: "Other" }),
  ];

  it("matches on ocr text", () => {
    expect(keywordSearch("receipt", shots).map((s) => s.id)).toEqual(["1"]);
  });

  it("matches on summary", () => {
    expect(keywordSearch("john", shots).map((s) => s.id)).toEqual(["2"]);
  });

  it("matches on tags", () => {
    expect(keywordSearch("shopping", shots).map((s) => s.id)).toEqual(["1"]);
  });

  it("returns empty when nothing matches", () => {
    expect(keywordSearch("zzz-nothing", shots)).toEqual([]);
  });
});

describe("semanticSearch", () => {
  beforeEach(() => {
    vi.mocked(generateEmbedding).mockReset();
  });

  it("filters out screenshots without embeddings and ranks by cosine similarity", async () => {
    vi.mocked(generateEmbedding).mockResolvedValueOnce([1, 0, 0]);

    const shots = [
      shot({ id: "aligned", embedding: [0.9, 0.1, 0] }),
      shot({ id: "orthogonal", embedding: [0, 1, 0] }),
      shot({ id: "noEmbedding" }),
    ];

    const result = await semanticSearch("query", shots);

    expect(result.map((s) => s.id)).toEqual(["aligned"]);
  });

  it("returns empty list when no screenshots have embeddings", async () => {
    vi.mocked(generateEmbedding).mockResolvedValueOnce([1, 0, 0]);
    const shots = [shot({ id: "1" }), shot({ id: "2" })];
    const result = await semanticSearch("query", shots);
    expect(result).toEqual([]);
  });

  it("propagates embedding errors to callers", async () => {
    vi.mocked(generateEmbedding).mockRejectedValueOnce(new Error("boom"));
    await expect(semanticSearch("query", [])).rejects.toThrow("boom");
  });
});
