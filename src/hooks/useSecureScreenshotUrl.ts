import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/supabase';

type CacheEntry = {
  url: string | null;
  refCount: number;
  promise: Promise<string>;
  controller: AbortController;
};

const cache = new Map<string, CacheEntry>();

const acquire = (key: string): Promise<string> => {
  let entry = cache.get(key);
  if (!entry) {
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
      } else {
        URL.revokeObjectURL(url);
      }
      return url;
    })();
    entry = { url: null, refCount: 0, promise, controller };
    cache.set(key, entry);
    promise.catch(() => {
      const current = cache.get(key);
      if (current && current.promise === promise) {
        cache.delete(key);
      }
    });
  }
  entry.refCount += 1;
  return entry.promise;
};

const release = (key: string) => {
  const entry = cache.get(key);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  if (entry.url) {
    URL.revokeObjectURL(entry.url);
  } else {
    entry.controller.abort();
  }
  cache.delete(key);
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
    setImageUrl('');

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
