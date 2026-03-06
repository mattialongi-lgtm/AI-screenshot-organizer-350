/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Category = 
  | 'Chat' 
  | 'Receipt' 
  | 'Social Media' 
  | 'Email' 
  | 'Document' 
  | 'Meme' 
  | 'Banking' 
  | 'E-commerce' 
  | 'Booking' 
  | 'Other';

export interface ScreenshotEntities {
  dates: string[];
  amounts: string[];
  emails: string[];
  urls: string[];
  phones: string[];
  order_ids: string[];
  merchant?: string;
}

export interface ScreenshotMetadata {
  id?: string | number;
  userId?: string;
  createdAt: number;
  filename: string;
  imageBlob?: Blob;
  ocrText: string;
  summary: string;
  category: Category;
  tags: string[];
  entities: ScreenshotEntities;
  embedding?: number[];
  source: 'upload' | 'manual';
  imageUrl?: string;
  lastAnalyzedAt?: number;
  isAnalyzed: boolean;
  isSensitive?: boolean;
  safetyReason?: string;
}

export interface AnalysisResult {
  category: Category;
  summary: string;
  ocr_text: string;
  tags: string[];
  entities: ScreenshotEntities;
  safety: {
    contains_sensitive: boolean;
    reason: string;
  };
}

export interface ChatResponse {
  answer: string;
  used_ids: (string | number)[];
}
