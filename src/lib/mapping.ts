/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScreenshotMetadata, Category } from '../types';

export const mapDbToScreenshot = (dbData: any): ScreenshotMetadata => {
  const userId = dbData.userId || dbData.user_id;
  const filename = dbData.filename || dbData.original_name;
  
  // Reconstruct imageUrl from storage path if not directly provided
  let imageUrl = dbData.imageUrl || dbData.image_url;
  if (!imageUrl && userId && filename) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (supabaseUrl) {
      // Filename usually contains the folder structure in our new implementation
      // formats: "user_id/filename" or just "filename"
      const path = filename.includes('/') ? filename : `${userId}/${filename}`;
      imageUrl = `${supabaseUrl}/storage/v1/object/public/screenshots/${path}`;
    }
  }

  return {
    id: dbData.id,
    userId,
    createdAt: new Date(dbData.createdAt || dbData.created_at || dbData.upload_date || Date.now()).getTime(),
    filename,
    ocrText: dbData.ocrText || dbData.ocr_text || '',
    summary: dbData.summary || '',
    category: (dbData.category || 'Other') as Category,
    tags: Array.isArray(dbData.tags) ? dbData.tags.map((t: any) => typeof t === 'string' ? t : t.tag) : [],
    entities: dbData.entities || { dates: [], amounts: [], emails: [], urls: [], phones: [], order_ids: [] },
    embedding: dbData.embedding,
    source: dbData.source || 'upload',
    imageUrl,
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
    original_name: screenshot.filename,
    category: screenshot.category,
    summary: screenshot.summary,
    ocr_text: screenshot.ocrText,
    entities: screenshot.entities,
    embedding: screenshot.embedding,
    is_sensitive: screenshot.isSensitive ? 1 : 0,
    is_analyzed: screenshot.isAnalyzed ? 1 : 0,
    user_id: screenshot.userId,
    upload_date: new Date(screenshot.createdAt).toISOString(),
    safety_reason: screenshot.safetyReason,
    last_analyzed_at: screenshot.lastAnalyzedAt ? new Date(screenshot.lastAnalyzedAt).toISOString() : null,
    source: screenshot.source
  };
};
