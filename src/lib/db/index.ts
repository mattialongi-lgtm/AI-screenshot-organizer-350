/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { openDB, IDBPDatabase } from 'idb';
import { ScreenshotMetadata } from '../../types';

const DB_NAME = 'ai-screenshot-organizer';
const DB_VERSION = 2;
const STORE_NAME = 'screenshots';
const SOURCES_STORE = 'sources';

let dbPromise: Promise<IDBPDatabase<any>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('category', 'category');
        }
        
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(SOURCES_STORE)) {
            db.createObjectStore(SOURCES_STORE, {
              keyPath: 'id',
            });
          }
        }
      },
    });
  }
  return dbPromise;
};

// ... existing screenshot functions ...

export const getAllSources = async () => {
  const db = await initDB();
  return db.getAll(SOURCES_STORE);
};

export const saveSource = async (source: any) => {
  const db = await initDB();
  return db.put(SOURCES_STORE, source);
};

export const deleteSource = async (id: string) => {
  const db = await initDB();
  return db.delete(SOURCES_STORE, id);
};

export const saveScreenshot = async (screenshot: ScreenshotMetadata): Promise<number> => {
  const db = await initDB();
  return db.add(STORE_NAME, screenshot);
};

export const updateScreenshot = async (screenshot: ScreenshotMetadata): Promise<number> => {
  const db = await initDB();
  return db.put(STORE_NAME, screenshot);
};

export const deleteScreenshot = async (id: number): Promise<void> => {
  const db = await initDB();
  return db.delete(STORE_NAME, id);
};

export const getAllScreenshots = async (): Promise<ScreenshotMetadata[]> => {
  const db = await initDB();
  return db.getAllFromIndex(STORE_NAME, 'createdAt');
};

export const getScreenshotById = async (id: number): Promise<ScreenshotMetadata | undefined> => {
  const db = await initDB();
  return db.get(STORE_NAME, id);
};
