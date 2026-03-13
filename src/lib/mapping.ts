/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScreenshotMetadata, Category } from '../types';

export const mapDbToScreenshot = (dbData: any): ScreenshotMetadata => {
  return {
    id: dbData.id,
    userId: dbData.userId || dbData.user_id,
    createdAt: new Date(dbData.createdAt || dbData.created_at).getTime(),
    filename: dbData.filename || dbData.original_name,
    ocrText: dbData.ocrText || dbData.ocr_text || '',
    summary: dbData.summary || '',
    category: (dbData.category || 'Other') as Category,
    tags: Array.isArray(dbData.tags) ? dbData.tags : [],
    entities: dbData.entities || { dates: [], amounts: [], emails: [], urls: [], phones: [], order_ids: [] },
    embedding: dbData.embedding,
    source: dbData.source || 'upload',
    imageUrl: dbData.imageUrl || dbData.image_url,
    isAnalyzed: !!(
      dbData.is_analyzed === 1 || 
      dbData.is_analyzed === true || 
      dbData.isAnalyzed === 1 || 
      dbData.isAnalyzed === true || 
      (dbData.summary && dbData.summary.length > 5) ||
      (dbData.ocr_text && dbData.ocr_text.length > 0)
    ),
    isSensitive: !!(dbData.isSensitive || dbData.is_sensitive === 1 || dbData.is_sensitive === true),
    safetyReason: dbData.safetyReason || dbData.safety_reason || '',
    lastAnalyzedAt: dbData.lastAnalyzedAt ? new Date(dbData.lastAnalyzedAt).getTime() : 
                    dbData.last_analyzed_at ? new Date(dbData.last_analyzed_at).getTime() : undefined,
  };
};

export const mapScreenshotToDb = (screenshot: ScreenshotMetadata): any => {
  return {
    filename: screenshot.filename,
    original_name: screenshot.filename, // or keep existing if available
    category: screenshot.category,
    summary: screenshot.summary,
    ocr_text: screenshot.ocrText,
    tags: screenshot.tags,
    entities: screenshot.entities,
    embedding: screenshot.embedding,
    is_sensitive: screenshot.isSensitive ? 1 : 0,
    is_analyzed: screenshot.isAnalyzed ? 1 : 0,
    userId: screenshot.userId,
    createdAt: new Date(screenshot.createdAt).toISOString(),
    safety_reason: screenshot.safetyReason,
    last_analyzed_at: screenshot.lastAnalyzedAt ? new Date(screenshot.lastAnalyzedAt).toISOString() : null,
    imageUrl: screenshot.imageUrl,
    source: screenshot.source
  };
};
