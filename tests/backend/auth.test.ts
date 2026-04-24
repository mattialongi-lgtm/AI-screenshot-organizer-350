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

describe("requireAuth middleware", () => {
  it("rejects requests without Authorization header", async () => {
    const res = await request(app).get("/api/screenshots");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing bearer token/i);
  });

  it("rejects malformed Authorization headers", async () => {
    const res = await request(app)
      .get("/api/screenshots")
      .set("Authorization", "Basic not-a-bearer");
    expect(res.status).toBe(401);
  });

  it("rejects bearer tokens that Supabase does not recognize", async () => {
    const res = await request(app)
      .get("/api/screenshots")
      .set("Authorization", "Bearer unknown-token");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired token/i);
  });

  it("allows requests with a valid bearer token", async () => {
    supabaseState.users.set("valid-token", { id: "user-1" });
    supabaseState.tables.set("screenshots", { data: [], error: null });

    const res = await request(app)
      .get("/api/screenshots")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
