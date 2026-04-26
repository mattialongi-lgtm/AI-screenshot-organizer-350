export const UPLOAD_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const UPLOAD_REQUEST_LIMIT = 50;
export const MANUAL_UPLOAD_BATCH_LIMIT = UPLOAD_REQUEST_LIMIT;

export const formatUploadWindowMinutes = () =>
  Math.round(UPLOAD_RATE_LIMIT_WINDOW_MS / 60000);
