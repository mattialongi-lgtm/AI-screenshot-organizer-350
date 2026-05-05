import type { CloudSource, SourceSettings } from "../types";

export const defaultSourceSettings: SourceSettings = {
  keywords: ["screenshot", "Screenshot", "screen shot", "Screen Shot", "screenshots", "Schermata", "schermata", "IMG_"],
  dateRangeDays: 30,
  maxFiles: 200,
  autoSyncEnabled: false,
  intervalMinutes: 15,
};

export async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || `HTTP ${res.status}` };
  }
}

export function normalizeSource(source: any): CloudSource {
  return {
    id: String(source.id),
    provider: "googleDrive",
    status:
      source.status === "error"
        ? "error"
        : source.status === "connected"
          ? "connected"
          : "disconnected",
    connectedAt:
      typeof source.connectedAt === "number"
        ? source.connectedAt
        : source.connected_at
          ? new Date(source.connected_at).getTime()
          : undefined,
    lastSyncAt:
      typeof source.lastSyncAt === "number"
        ? source.lastSyncAt
        : source.last_sync
          ? new Date(source.last_sync).getTime()
          : undefined,
    accountEmail: source.accountEmail || source.email || undefined,
    settings: source.settings || defaultSourceSettings,
  };
}

export function extractSyncError(payload: any): string | null {
  if (Array.isArray(payload?.results)) {
    const first = payload.results.find((result: any) => result?.error);
    if (first?.error) return first.error;
  }
  return payload?.error ?? null;
}

export function buildSyncSummary(payload: any): string {
  const first = Array.isArray(payload?.results) ? payload.results[0] : null;
  const summary = [
    `Imported ${payload?.syncedCount || 0} new screenshot(s).`,
    first?.found ? `Found ${first.found} Drive image candidate(s).` : null,
    first?.skipped ? `Skipped ${first.skipped}.` : null,
    first?.errors ? `Errors ${first.errors}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const errorDetails = first?.errorDetails;
  if (errorDetails && Array.isArray(errorDetails) && errorDetails.length > 0) {
    const errorLines = errorDetails
      .slice(0, 3)
      .map((err: any) => `• ${err.fileId}: ${err.message}`)
      .join("\n");
    return `${summary}\n\nFailed files:\n${errorLines}${errorDetails.length > 3 ? `\n... and ${errorDetails.length - 3} more` : ""}`;
  }

  return summary;
}
