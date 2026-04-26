/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScreenshotMetadata } from "../../types";
import { generateEmbedding } from "../ai/openai";

const STOPWORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","of","to","in","on","at","for","by","with","about",
  "as","and","or","but","if","then","than","this","that","these","those","it","its","i","me","my","mine","you",
  "your","yours","we","our","ours","they","them","their","theirs","he","she","him","her","his","hers",
  "tell","show","find","what","which","where","when","why","how","does","do","did","done","have","has","had",
  "can","could","should","would","will","just","really","actually","one","some","any","all","every","each",
  "screenshot","screenshots","screen","screens","image","images","file","files","please",
]);

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

const fieldText = (s: ScreenshotMetadata) =>
  `${s.ocrText} ${s.summary} ${s.category} ${s.tags.join(" ")}`.toLowerCase();

export const keywordSearch = (query: string, screenshots: ScreenshotMetadata[]): ScreenshotMetadata[] => {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = screenshots
    .map((s) => {
      const haystack = fieldText(s);
      let hits = 0;
      for (const t of tokens) {
        if (haystack.includes(t)) hits += 1;
      }
      return { s, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  return scored.map((x) => x.s);
};

export const semanticSearch = async (query: string, screenshots: ScreenshotMetadata[]): Promise<ScreenshotMetadata[]> => {
  const queryEmbedding = await generateEmbedding(query);

  const results = screenshots.map(s => {
    if (!s.embedding) return { ...s, similarity: 0 };
    const similarity = cosineSimilarity(queryEmbedding, s.embedding);
    return { ...s, similarity };
  });

  return results
    .filter(s => s.similarity > 0.25)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10);
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
