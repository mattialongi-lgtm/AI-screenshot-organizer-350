// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildSyncSummary,
  defaultSourceSettings,
  extractSyncError,
  normalizeSource,
  parseJsonResponse,
} from "../../src/pages/sourcesHelpers";

describe("normalizeSource", () => {
  it("maps snake_case backend rows into the CloudSource shape", () => {
    const result = normalizeSource({
      id: 42,
      status: "connected",
      connected_at: "2026-01-01T00:00:00.000Z",
      last_sync: "2026-01-02T00:00:00.000Z",
      email: "user@example.com",
    });

    expect(result).toMatchObject({
      id: "42",
      provider: "googleDrive",
      status: "connected",
      accountEmail: "user@example.com",
    });
    expect(result.connectedAt).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
    expect(result.lastSyncAt).toBe(new Date("2026-01-02T00:00:00.000Z").getTime());
    expect(result.settings).toEqual(defaultSourceSettings);
  });

  it("defaults unknown status values to disconnected", () => {
    expect(normalizeSource({ id: "x" }).status).toBe("disconnected");
    expect(normalizeSource({ id: "x", status: "weird" }).status).toBe("disconnected");
    expect(normalizeSource({ id: "x", status: "error" }).status).toBe("error");
  });

  it("prefers already-normalized camelCase fields when present", () => {
    const result = normalizeSource({
      id: "src",
      accountEmail: "camel@example.com",
      connectedAt: 1000,
      lastSyncAt: 2000,
    });

    expect(result.accountEmail).toBe("camel@example.com");
    expect(result.connectedAt).toBe(1000);
    expect(result.lastSyncAt).toBe(2000);
  });
});

describe("parseJsonResponse", () => {
  it("returns parsed JSON on success", async () => {
    const res = new Response(JSON.stringify({ hello: "world" }), { status: 200 });
    await expect(parseJsonResponse(res)).resolves.toEqual({ hello: "world" });
  });

  it("returns empty object for empty bodies", async () => {
    const res = new Response("", { status: 200 });
    await expect(parseJsonResponse(res)).resolves.toEqual({});
  });

  it("surfaces raw text as error when body is not JSON", async () => {
    const res = new Response("Internal error", { status: 500 });
    await expect(parseJsonResponse(res)).resolves.toEqual({ error: "Internal error" });
  });
});

describe("sync response handlers", () => {
  it("extractSyncError prefers the first result error", () => {
    expect(
      extractSyncError({
        error: "generic",
        results: [{}, { error: "per-source failure" }],
      }),
    ).toBe("per-source failure");
  });

  it("extractSyncError falls back to the top-level error", () => {
    expect(extractSyncError({ error: "top", results: [] })).toBe("top");
    expect(extractSyncError({})).toBeNull();
  });

  it("buildSyncSummary reports imported, skipped, and error counts", () => {
    const summary = buildSyncSummary({
      syncedCount: 4,
      results: [{ skipped: 2, errors: 1 }],
    });
    expect(summary).toBe("Imported 4 new screenshot(s). Skipped 2. Errors 1.");
  });

  it("buildSyncSummary works with no results array", () => {
    expect(buildSyncSummary({ syncedCount: 0 })).toBe("Imported 0 new screenshot(s).");
  });
});
