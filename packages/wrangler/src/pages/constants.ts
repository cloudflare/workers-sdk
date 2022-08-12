export const PAGES_CONFIG_CACHE_FILENAME = "pages.json";
export const MAX_BUCKET_SIZE = 50 * 1024 * 1024;
export const MAX_BUCKET_FILE_COUNT = 5000;
export const BULK_UPLOAD_CONCURRENCY = 3;
export const MAX_UPLOAD_ATTEMPTS = 5;
export const MAX_CHECK_MISSING_ATTEMPTS = 5;
export const SECONDS_TO_WAIT_FOR_PROXY = 5;
export const isInPagesCI = !!process.env.CF_PAGES;
/** The max number of rules in _routes.json */
export const MAX_FUNCTIONS_ROUTES_RULES = 100;
export const MAX_FUNCTIONS_ROUTES_RULE_LENGTH = 100;
export const ROUTES_SPEC_VERSION = 1;
