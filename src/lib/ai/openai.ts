/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AnalysisResult, ChatMessage, ChatResponse, ScreenshotMetadata } from "../../types";
import { authenticatedFetch } from "../supabase";

const API_URL = (import.meta as any).env.VITE_API_URL;
const API_BASE = typeof API_URL === "string" ? API_URL.replace(/\/$/, "") : "";

export const isMockMode = false;

export interface AnalyzeApiResponse extends AnalysisResult {
  embedding?: number[];
  requestId?: string;
  screenshotId?: string | number;
  saveWarnings?: string[];
}

const buildBackendError = async (res: Response, fallbackLabel: string) => {
  try {
    const data = await res.json();
    const requestId = data?.requestId ? ` [requestId=${data.requestId}]` : "";
    const backendMessage = data?.error ? ` ${data.error}` : "";
    return new Error(`${fallbackLabel}: ${res.status}${requestId}${backendMessage}`);
  } catch {
    return new Error(`${fallbackLabel}: ${res.status}`);
  }
};

export const analyzeScreenshot = async (imageBlob: Blob): Promise<AnalysisResult> => {
  const base64Image = await blobToBase64(imageBlob);
  const res = await authenticatedFetch(buildApiUrl("/api/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image.split(",")[1], mimeType: imageBlob.type }),
  });
  if (!res.ok) throw await buildBackendError(res, "Backend analyze failed");
  return await res.json();
};

export const analyzeStoredScreenshot = async (
  screenshotId: string | number,
): Promise<AnalyzeApiResponse> => {
  const res = await authenticatedFetch(buildApiUrl("/api/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screenshotId }),
  });

  if (!res.ok) {
    throw await buildBackendError(res, "Backend stored analyze failed");
  }

  return await res.json();
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const res = await authenticatedFetch(buildApiUrl("/api/embed"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw await buildBackendError(res, "Backend embed failed");
  const data = await res.json();
  return data.embedding;
};

export const askScreenshots = async (
  question: string, 
  relevantScreenshots: ScreenshotMetadata[],
  history: ChatMessage[] = [],
): Promise<ChatResponse> => {
  const context = relevantScreenshots.map((s) => ({
    id: s.id,
    category: s.category,
    summary: s.summary,
    ocrText: s.ocrText,
    tags: s.tags,
    entities: s.entities,
  }));
  const res = await authenticatedFetch(buildApiUrl("/api/ask"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      context,
      history: history.map((message) => ({
        role: message.role,
        text: message.text,
        ids: message.ids ?? [],
      })),
    }),
  });
  if (!res.ok) throw await buildBackendError(res, "Backend ask failed");
  return await res.json();
};

const buildApiUrl = (pathname: string) => `${API_BASE}${pathname}`;

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
