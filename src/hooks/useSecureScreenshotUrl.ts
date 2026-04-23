import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/supabase';

export const useSecureScreenshotUrl = (
  screenshotId?: string | number | null,
) => {
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (screenshotId == null) {
      setImageUrl('');
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    let isActive = true;

    const loadImage = async () => {
      try {
        const response = await authenticatedFetch(`/api/screenshots/${encodeURIComponent(String(screenshotId))}/image`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Secure screenshot request failed with HTTP ${response.status}`);
        }

        const blob = await response.blob();
        if (!blob.size) {
          throw new Error('Secure screenshot response was empty.');
        }

        objectUrl = URL.createObjectURL(blob);
        if (isActive) {
          setImageUrl(objectUrl);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error('Failed to load secure screenshot image:', error);
        if (isActive) {
          setImageUrl('');
        }
      }
    };

    setImageUrl('');
    void loadImage();

    return () => {
      isActive = false;
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [screenshotId]);

  return imageUrl;
};
