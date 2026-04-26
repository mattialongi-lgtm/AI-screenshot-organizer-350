import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

const analysisPayload = {
  category: "Receipt",
  summary: "Coffee shop receipt",
  ocr_text: "Latte $5.25",
  tags: ["coffee", "receipt"],
  entities: {
    dates: ["2026-04-26"],
    amounts: ["$5.25"],
    emails: [],
    urls: [],
    phones: [],
    order_ids: ["A-42"],
    merchant: "Blue Bottle",
  },
  safety: { contains_sensitive: false, reason: "" },
};

const embeddingValues = new Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.01 : -0.01));

vi.mock("openai", () => {
  class FakeOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify(analysisPayload) } }],
        }),
      },
    };
    embeddings = {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: embeddingValues }],
      }),
    };
  }
  return { default: FakeOpenAI };
});

vi.mock("@supabase/supabase-js", async () => {
  const { supabaseMockModule } = await import("./supabaseMock");
  return supabaseMockModule();
});

import { supabaseState } from "./supabaseMock";

let app: any;

beforeAll(async () => {
  ({ app } = await import("../../server"));
});

afterEach(() => {
  supabaseState.reset();
});

describe("POST /api/upload happy path", () => {
  it("uploads to storage, persists analysis, and returns the screenshot row", async () => {
    supabaseState.users.set("valid-token", { id: "user-1" });
    supabaseState.tables.set("screenshots", {
      data: {
        id: "shot-new",
        user_id: "user-1",
        filename: "user-1/placeholder.png",
        storage_path: "user-1/placeholder.png",
        original_name: "coffee.png",
        category: analysisPayload.category,
        summary: analysisPayload.summary,
        ocr_text: analysisPayload.ocr_text,
        is_analyzed: 1,
        is_sensitive: 0,
      },
      error: null,
    });
    supabaseState.tables.set("tags", { data: [], error: null });

    const fileBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", "Bearer valid-token")
      .attach("screenshot", fileBytes, { filename: "coffee.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(res.body.screenshot).toMatchObject({
      id: "shot-new",
      user_id: "user-1",
      category: "Receipt",
      summary: "Coffee shop receipt",
      tags: [{ tag: "coffee" }, { tag: "receipt" }],
    });

    expect(supabaseState.storageUploads).toHaveLength(1);
    const upload = supabaseState.storageUploads[0];
    expect(upload.bucket).toBe("screenshots");
    expect(upload.path.startsWith("user-1/")).toBe(true);
    expect(upload.path.endsWith("coffee.png")).toBe(true);
    expect(upload.contentType).toBe("image/png");
    expect(upload.size).toBe(fileBytes.length);

    const screenshotInserts = supabaseState.inserts.get("screenshots");
    expect(screenshotInserts).toHaveLength(1);
    const inserted = screenshotInserts![0][0];
    expect(inserted).toMatchObject({
      user_id: "user-1",
      original_name: "coffee.png",
      source: "upload",
      category: "Receipt",
      summary: "Coffee shop receipt",
      ocr_text: "Latte $5.25",
      is_analyzed: 1,
      is_sensitive: 0,
      safety_reason: "",
    });
    expect(inserted.storage_path).toBe(upload.path);
    expect(inserted.filename).toBe(upload.path);
    expect(inserted.entities).toMatchObject({ amounts: ["$5.25"], merchant: "Blue Bottle" });
    expect(Array.isArray(inserted.embedding)).toBe(true);
    expect(inserted.embedding).toHaveLength(768);

    const tagInserts = supabaseState.inserts.get("tags") ?? [];
    const insertedTagRows = tagInserts.flat();
    expect(insertedTagRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ screenshot_id: "shot-new", tag: "coffee" }),
        expect.objectContaining({ screenshot_id: "shot-new", tag: "receipt" }),
      ]),
    );
  });
});
