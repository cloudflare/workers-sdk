/** Backoff delays between successive tail reconnect attempts (ms). */
export const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

/** How many reconnect attempts a tail makes before giving up. */
export const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;
