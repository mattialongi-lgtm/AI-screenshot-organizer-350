import type { Category, ScreenshotMetadata } from "../types";

export type StructuredFilters = {
  activeCategory: Category | "All";
  hasAmount: boolean;
  hasUrl: boolean;
};

export function getScreenshotsByIds(
  source: ScreenshotMetadata[],
  ids: (string | number)[],
): ScreenshotMetadata[] {
  if (ids.length === 0) return [];

  const byId = new Map(
    source
      .filter((screenshot) => screenshot.id != null)
      .map((screenshot) => [String(screenshot.id), screenshot]),
  );

  return ids.flatMap((id) => {
    const screenshot = byId.get(String(id));
    return screenshot ? [screenshot] : [];
  });
}

export function applyStructuredFilters(
  source: ScreenshotMetadata[],
  filters: StructuredFilters,
): ScreenshotMetadata[] {
  let result = [...source];

  if (filters.activeCategory !== "All") {
    result = result.filter((s) => s.category === filters.activeCategory);
  }

  if (filters.hasAmount) {
    result = result.filter((s) => s.entities.amounts.length > 0);
  }

  if (filters.hasUrl) {
    result = result.filter((s) => s.entities.urls.length > 0);
  }

  return result;
}
