/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScreenshotMetadata } from "../../types";
import { generateEmbedding } from "../ai/openai";

export const keywordSearch = (query: string, screenshots: ScreenshotMetadata[]): ScreenshotMetadata[] => {
  const q = query.toLowerCase();
  return screenshots.filter(s => 
    s.ocrText.toLowerCase().includes(q) ||
    s.summary.toLowerCase().includes(q) ||
    s.tags.some(tag => tag.toLowerCase().includes(q)) ||
    s.category.toLowerCase().includes(q)
  );
};

export const semanticSearch = async (query: string, screenshots: ScreenshotMetadata[]): Promise<ScreenshotMetadata[]> => {
  const queryEmbedding = await generateEmbedding(query);
  
  const results = screenshots.map(s => {
    if (!s.embedding) return { ...s, similarity: 0 };
    const similarity = cosineSimilarity(queryEmbedding, s.embedding);
    return { ...s, similarity };
  });

  return results
    .filter(s => s.similarity > 0.5)
    .sort((a, b) => b.similarity - a.similarity);
};

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    mA += a[i] * a[i];
    mB += b[i] * b[i];
  }
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  if (mA === 0 || mB === 0) return 0;
  return dotProduct / (mA * mB);
};
