/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, Category, ChatResponse, ScreenshotMetadata } from "../../types";
import { authenticatedFetch } from "../supabase";

const GEMINI_API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY;
const API_URL = (import.meta as any).env.VITE_API_URL;

export const isMockMode = !GEMINI_API_KEY && !API_URL;

const MOCK_ANALYSIS: AnalysisResult = {
  category: "Receipt",
  summary: "A receipt from Amazon for a purchase of $42.50.",
  ocr_text: "Amazon.com Order #123-456789-0123456 Total: $42.50 Date: 2026-03-05",
  tags: ["Amazon", "Shopping", "Receipt", "Electronics"],
  entities: {
    dates: ["2026-03-05"],
    amounts: ["$42.50"],
    emails: [],
    urls: ["amazon.com"],
    phones: [],
    order_ids: ["123-456789-0123456"],
    merchant: "Amazon"
  },
  safety: {
    contains_sensitive: false,
    reason: ""
  }
};

const MOCK_CHAT_RESPONSE: ChatResponse = {
  answer: "Based on your screenshots, you spent $42.50 at Amazon on March 5th.",
  used_ids: ["mock-1"]
};

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
  console.log("DEBUG: analyzeScreenshot started for blob type:", imageBlob.type);
  if (isMockMode) {
    console.log("DEBUG: Mock mode active, returning mock analysis");
    await new Promise(resolve => setTimeout(resolve, 2000));
    return MOCK_ANALYSIS;
  }

  if (API_URL) {
    console.log("DEBUG: Using backend API at", API_URL);
    const base64Image = await blobToBase64(imageBlob);
    const res = await authenticatedFetch(`${API_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64Image.split(',')[1], mimeType: imageBlob.type }),
    });
    if (!res.ok) throw await buildBackendError(res, "Backend analyze failed");
    return await res.json();
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  console.log("DEBUG: Converting blob to base64...");
  const base64Image = await blobToBase64(imageBlob);
  console.log("DEBUG: Base64 conversion complete (length:", base64Image.length, ")");

  try {
    console.log("DEBUG: Calling Gemini API via models.generateContent...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: imageBlob.type,
                data: base64Image.split(',')[1],
              },
            },
            {
              text: `Analyze this screenshot and return a JSON object with the following schema:
              {
                "category": "Chat" | "Receipt" | "Social Media" | "Email" | "Document" | "Meme" | "Banking" | "E-commerce" | "Booking" | "Other",
                "summary": "1-2 line summary",
                "ocr_text": "full extracted text",
                "tags": ["tag1", "tag2", ...],
                "entities": {
                  "dates": [],
                  "amounts": [],
                  "emails": [],
                  "urls": [],
                  "phones": [],
                  "order_ids": [],
                  "merchant": ""
                },
                "safety": { "contains_sensitive": true/false, "reason": "" }
              }`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    console.log("DEBUG: Response received from Gemini");

    let text = '';
    const res = response as any;
    if (typeof res.text === 'function') {
      text = await res.text();
    } else if (typeof res.text === 'string') {
      text = res.text;
    } else if (res.response && typeof res.response.text === 'function') {
      text = await res.response.text();
    } else if (res.response && typeof res.response.text === 'string') {
      text = res.response.text;
    }

    console.log("DEBUG: Raw AI text:", text.slice(0, 100), "...");

    if (!text) throw new Error("Empty response from AI");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    console.log("DEBUG: Parse successful, category:", parsed.category);
    return parsed;
  } catch (err) {
    console.error("DEBUG: Gemini API ERROR:", err);
    throw err;
  }
};

export const analyzeStoredScreenshot = async (
  screenshotId: string | number,
): Promise<AnalyzeApiResponse> => {
  const endpoint = API_URL ? `${API_URL}/api/analyze` : "/api/analyze";

  const res = await authenticatedFetch(endpoint, {
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
  console.log("DEBUG: generateEmbedding started for text length:", text.length);
  if (isMockMode) {
    return Array(768).fill(0).map(() => Math.random());
  }

  if (API_URL) {
    const res = await authenticatedFetch(`${API_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw await buildBackendError(res, "Backend embed failed");
    const data = await res.json();
    return data.embedding;
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  try {
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [{ parts: [{ text }] }],
    });
    console.log("DEBUG: Embedding generation complete");
    return (result as any).embeddings[0].values || (result as any).embedding.values;
  } catch (err) {
    console.error("DEBUG: Embedding ERROR:", err);
    throw err;
  }
};

export const askScreenshots = async (
  question: string, 
  relevantScreenshots: ScreenshotMetadata[]
): Promise<ChatResponse> => {
  console.log("DEBUG: askScreenshots started for question:", question);
  if (isMockMode) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return MOCK_CHAT_RESPONSE;
  }

  if (API_URL) {
    const context = relevantScreenshots.map(s => ({
      id: s.id,
      summary: s.summary,
      ocrText: s.ocrText,
      entities: s.entities,
    }));
    const res = await authenticatedFetch(`${API_URL}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context }),
    });
    if (!res.ok) throw new Error(`Backend ask failed: ${res.status}`);
    return await res.json();
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const context = relevantScreenshots.map(s => 
    `ID: ${s.id}\nSummary: ${s.summary}\nOCR Text: ${s.ocrText}\nEntities: ${JSON.stringify(s.entities)}`
  ).join("\n---\n");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            {
              text: `You are an AI assistant helping a user with their screenshots.
              Answer the user's question using ONLY the provided context.
              If the answer is not in the context, say you don't know.
              Return a JSON object with the following schema:
              {
                "answer": "your answer here",
                "used_ids": [id1, id2, ...]
              }

              Context:
              ${context}

              Question: ${question}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    let text = '';
    const res = response as any;
    if (typeof res.text === 'function') {
      text = await res.text();
    } else if (typeof res.text === 'string') {
      text = res.text;
    } else if (res.response && typeof res.response.text === 'function') {
      text = await res.response.text();
    } else if (res.response && typeof res.response.text === 'string') {
      text = res.response.text;
    }

    console.log("DEBUG: Raw chat AI text:", text.slice(0, 100), "...");
    
    if (!text) throw new Error("Empty chat response from AI");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return parsed;
  } catch (err) {
    console.error("DEBUG: Chat ERROR:", err);
    throw err;
  }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
