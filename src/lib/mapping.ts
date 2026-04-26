/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScreenshotMetadata, Category } from '../types';

const asStringArray = (val: unknown): string[] =>
  Array.isArray(val) ? val.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

const normalizeEntities = (raw: any): ScreenshotMetadata['entities'] => {
  let src: any = raw;
  if (typeof src === 'string') {
    try { src = JSON.parse(src); } catch { src = null; }
  }
  src = src && typeof src === 'object' ? src : {};
  return {
    dates: asStringArray(src.dates),
    amounts: asStringArray(src.amounts),
    emails: asStringArray(src.emails),
    urls: asStringArray(src.urls),
    phones: asStringArray(src.phones),
    order_ids: asStringArray(src.order_ids),
    merchant: typeof src.merchant === 'string' ? src.merchant : undefined,
  };
};

export const mapDbToScreenshot = (dbData: any): ScreenshotMetadata => {
  const userId = dbData.userId || dbData.user_id;
  const storagePath = dbData.storagePath || dbData.storage_path || dbData.filename;
  const filename = storagePath || dbData.original_name;
  const source =
    dbData.source === 'googleDrive' || dbData.source === 'google_drive' || String(dbData.source_id || '').startsWith('google_drive:')
      ? 'googleDrive'
      : (dbData.source || 'upload');

  return {
    id: dbData.id,
    userId,
    createdAt: new Date(dbData.createdAt || dbData.created_at || dbData.upload_date || Date.now()).getTime(),
    filename,
    ocrText: dbData.ocrText || dbData.ocr_text || '',
    summary: dbData.summary || '',
    category: (dbData.category || 'Other') as Category,
    tags: Array.isArray(dbData.tags) ? dbData.tags.map((t: any) => typeof t === 'string' ? t : t.tag) : [],
    entities: normalizeEntities(dbData.entities),
    embedding: dbData.embedding,
    source,
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
    storage_path: screenshot.filename,
    upload_date: new Date(screenshot.createdAt).toISOString(),
    safety_reason: screenshot.safetyReason,
    last_analyzed_at: screenshot.lastAnalyzedAt ? new Date(screenshot.lastAnalyzedAt).toISOString() : null,
    source: screenshot.source
  };
};
