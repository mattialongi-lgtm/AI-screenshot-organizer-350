const rawApiBaseUrl = (import.meta as any).env.VITE_API_URL?.trim();

export const API_BASE_URL = rawApiBaseUrl
  ? rawApiBaseUrl.replace(/\/+$/, "")
  : "";

export const hasConfiguredApiBaseUrl = API_BASE_URL.length > 0;

export const buildApiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
};

export const getApiOrigin = () => {
  if (API_BASE_URL) {
    return new URL(API_BASE_URL).origin;
  }

  return window.location.origin;
};

export const getApiBaseUrl = () => {
  return API_BASE_URL || window.location.origin;
};

export const buildWebSocketUrl = (token: string) => {
  const baseUrl = API_BASE_URL
    ? new URL(API_BASE_URL)
    : new URL(window.location.origin);

  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.searchParams.set("token", token);
  return baseUrl.toString();
};
