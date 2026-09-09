const WRANGLER_STATE_WATCH_IGNORE = "**/.wrangler/**";

/**
 * Keep Miniflare persistence writes out of Vite's file watcher without
 * replacing any ignore patterns the user already configured.
 */
export function withWranglerStateIgnored(userIgnored: unknown): unknown {
	if (userIgnored == null) {
		return WRANGLER_STATE_WATCH_IGNORE;
	}

	if (Array.isArray(userIgnored)) {
		return [...userIgnored, WRANGLER_STATE_WATCH_IGNORE];
	}

	return [userIgnored, WRANGLER_STATE_WATCH_IGNORE];
}
