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

describe("GET /api/sources", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/sources");
    expect(res.status).toBe(401);
  });

  it("returns normalized Google Drive sources for the authenticated user", async () => {
    supabaseState.users.set("valid-token", { id: "user-1" });
    supabaseState.tables.set("cloud_sources", {
      data: [
        {
          id: "src-1",
          type: "google_drive",
          email: "user@example.com",
          status: "connected",
          connected_at: "2026-04-20T10:00:00.000Z",
          last_sync: "2026-04-22T12:00:00.000Z",
          settings: null,
        },
      ],
      error: null,
    });

    const res = await request(app)
      .get("/api/sources")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: "src-1",
      provider: "googleDrive",
      status: "connected",
      accountEmail: "user@example.com",
    });
    expect(res.body[0].settings).toEqual(
      expect.objectContaining({
        keywords: expect.any(Array),
        dateRangeDays: expect.any(Number),
      }),
    );
  });

  it("returns 500 when Supabase errors while loading sources", async () => {
    supabaseState.users.set("valid-token", { id: "user-1" });
    supabaseState.tables.set("cloud_sources", {
      data: null,
      error: { message: "db down" },
    });

    const res = await request(app)
      .get("/api/sources")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(500);
  });
});

describe("POST /api/sync", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/sync").send({});
    expect(res.status).toBe(401);
  });
});
