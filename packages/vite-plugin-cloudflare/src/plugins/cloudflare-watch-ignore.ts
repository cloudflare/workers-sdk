import type { UserConfig } from "vite";

const CLOUDFLARE_STATE_WATCH_IGNORE = "**/.cloudflare/**";

type ServerWatch = NonNullable<UserConfig["server"]>["watch"];
type WatchIgnored = NonNullable<ServerWatch>["ignored"];

/**
 * Keep Miniflare persistence writes out of Vite's file watcher without
 * replacing any ignore patterns the user already configured.
 *
 * @param userIgnored - Existing `server.watch.ignored` patterns, if any
 * @returns Ignore patterns that always include `.cloudflare` directories
 */
export function withCloudflareStateIgnored(
	userIgnored: WatchIgnored
): NonNullable<WatchIgnored> {
	if (userIgnored == null) {
		return CLOUDFLARE_STATE_WATCH_IGNORE;
	}

	if (Array.isArray(userIgnored)) {
		return [...userIgnored, CLOUDFLARE_STATE_WATCH_IGNORE];
	}

	return [userIgnored, CLOUDFLARE_STATE_WATCH_IGNORE];
}

/**
 * Ignore Cloudflare state and a framework's generated directory in Vite's watcher.
 *
 * Returns `null` when the user disabled watching with `server.watch: null`,
 * so this plugin does not turn the watcher back on.
 *
 * @param userWatch - The user's `server.watch` value from Vite config
 * @param directory - Absolute, normalized directory for generated Cloudflare files
 * @returns `null` when watching is disabled, otherwise a watch object whose
 *   `ignored` list includes `.cloudflare` directories
 */
export function getServerWatchConfig(
	userWatch: ServerWatch,
	directory?: string
): ServerWatch {
	if (userWatch === null) {
		return null;
	}

	const ignored = withCloudflareStateIgnored(userWatch?.ignored);
	return {
		...userWatch,
		ignored: directory
			? [
					...(Array.isArray(ignored) ? ignored : [ignored]),
					directory,
					`${directory}/**`,
				]
			: ignored,
	};
}
