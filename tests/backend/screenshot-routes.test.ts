import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

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

describe("screenshot routes require authentication", () => {
  it("POST /api/upload without token returns 401", async () => {
    const res = await request(app).post("/api/upload");
    expect(res.status).toBe(401);
  });

  it("DELETE /api/screenshots/:id without token returns 401", async () => {
    const res = await request(app).delete("/api/screenshots/abc");
    expect(res.status).toBe(401);
  });

  it("GET /api/screenshots/:id/image without token returns 401", async () => {
    const res = await request(app).get("/api/screenshots/abc/image");
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/screenshots/:id", () => {
  it("rejects invalid ids", async () => {
    supabaseState.users.set("valid-token", { id: "user-1" });

    const res = await request(app)
      .delete(`/api/screenshots/${"x".repeat(200)}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid screenshot id/i);
  });

  it("returns 404 when the screenshot does not belong to the user", async () => {
    supabaseState.users.set("valid-token", { id: "user-1" });
    supabaseState.tables.set("screenshots", { data: null, error: null });

    const res = await request(app)
      .delete("/api/screenshots/other-user-screenshot")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe("GET /api/screenshots/:id/image", () => {
  it("returns 400 when id is empty", async () => {
    supabaseState.users.set("valid-token", { id: "user-1" });

    const res = await request(app)
      .get(`/api/screenshots/${encodeURIComponent("   ")}/image`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(400);
  });

  it("returns 404 when the screenshot is missing", async () => {
    supabaseState.users.set("valid-token", { id: "user-1" });
    supabaseState.tables.set("screenshots", { data: null, error: null });

    const res = await request(app)
      .get("/api/screenshots/missing-id/image")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
