export const PAGES_CONFIG_CACHE_FILENAME = "pages.json";
export const MAX_BUCKET_SIZE = 50 * 1024 * 1024;
export const MAX_BUCKET_FILE_COUNT = 5000;
export const BULK_UPLOAD_CONCURRENCY = 3;
export const MAX_UPLOAD_ATTEMPTS = 5;
export const SECONDS_TO_WAIT_FOR_PROXY = 5;
export const isInPagesCI = !!process.env.CF_PAGES;
