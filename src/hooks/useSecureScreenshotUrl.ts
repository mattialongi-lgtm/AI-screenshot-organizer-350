import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/supabase';

type CacheEntry = {
  url: string | null;
  refCount: number;
  promise: Promise<string> | null;
  controller: AbortController | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
};

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

const clearCleanupTimer = (entry: CacheEntry) => {
  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }
};

const scheduleCleanup = (key: string, entry: CacheEntry) => {
  clearCleanupTimer(entry);
  entry.cleanupTimer = setTimeout(() => {
    const current = cache.get(key);
    if (!current || current.refCount > 0) {
      return;
    }

    current.cleanupTimer = null;

    if (current.url) {
      URL.revokeObjectURL(current.url);
    } else {
      current.controller?.abort();
    }

    cache.delete(key);
  }, CACHE_TTL_MS);
};

const getCachedUrl = (key: string) => cache.get(key)?.url ?? null;

const acquire = (key: string): Promise<string> => {
  let entry = cache.get(key);
  if (!entry) {
    entry = {
      url: null,
      refCount: 0,
      promise: null,
      controller: null,
      cleanupTimer: null,
    };
    cache.set(key, entry);
  }

  clearCleanupTimer(entry);
  entry.refCount += 1;

  if (entry.url) {
    return Promise.resolve(entry.url);
  }

  if (entry.promise) {
    return entry.promise;
  }

  const controller = new AbortController();
  const promise = (async () => {
    const response = await authenticatedFetch(
      `/api/screenshots/${encodeURIComponent(key)}/image`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(`Secure screenshot request failed with HTTP ${response.status}`);
    }
    const blob = await response.blob();
    if (!blob.size) {
      throw new Error('Secure screenshot response was empty.');
    }

    const url = URL.createObjectURL(blob);
    const current = cache.get(key);
    if (current) {
      current.url = url;
      current.promise = null;
      current.controller = null;
      return url;
    }

    URL.revokeObjectURL(url);
    throw new Error('Secure screenshot cache entry was released before the image was ready.');
  })();

  entry.controller = controller;
  entry.promise = promise;

  promise.catch(() => {
    const current = cache.get(key);
    if (current && current.promise === promise) {
      clearCleanupTimer(current);
      cache.delete(key);
    }
  });

  return promise;
};

const release = (key: string) => {
  const entry = cache.get(key);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  scheduleCleanup(key, entry);
};

export const useSecureScreenshotUrl = (
  screenshotId?: string | number | null,
) => {
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (screenshotId === 'demo-1') {
      setImageUrl('/demo-receipt.png');
      return;
    }
    if (screenshotId === 'demo-2') {
      setImageUrl('/demo-poster.png');
      return;
    }
    if (screenshotId == null) {
      setImageUrl('');
      return;
    }

    const key = String(screenshotId);
    let isActive = true;
    setImageUrl(getCachedUrl(key) ?? '');

    acquire(key)
      .then((url) => {
        if (isActive) setImageUrl(url);
      })
      .catch((error) => {
        if (!isActive) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Failed to load secure screenshot image:', error);
        setImageUrl('');
      });

    return () => {
      isActive = false;
      release(key);
    };
  }, [screenshotId]);

  return imageUrl;
};
