/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, Category, ChatResponse, ScreenshotMetadata } from "../../types";

const GEMINI_API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY;

export const isMockMode = !GEMINI_API_KEY;

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

export const analyzeScreenshot = async (imageBlob: Blob): Promise<AnalysisResult> => {
  if (isMockMode) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return MOCK_ANALYSIS;
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const base64Image = await blobToBase64(imageBlob);

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-preview",
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

  return JSON.parse(response.text || "{}");
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  if (isMockMode) {
    return Array(768).fill(0).map(() => Math.random());
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const result = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: [{ parts: [{ text }] }],
  });
  return result.embeddings[0].values;
};

export const askScreenshots = async (
  question: string, 
  relevantScreenshots: ScreenshotMetadata[]
): Promise<ChatResponse> => {
  if (isMockMode) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return MOCK_CHAT_RESPONSE;
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const context = relevantScreenshots.map(s => 
    `ID: ${s.id}\nSummary: ${s.summary}\nOCR Text: ${s.ocrText}\nEntities: ${JSON.stringify(s.entities)}`
  ).join("\n---\n");

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-preview",
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

  return JSON.parse(response.text || "{}");
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
