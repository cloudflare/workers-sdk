import * as fs from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import type { EventName } from "chokidar/handler.js";

/**
 * A minimal watcher surface shared by the chokidar and recursive `fs.watch`
 * backends so `#ensureWatchingAssets` can treat them the same.
 */
export type AssetsWatcher = {
	close(): void | Promise<void>;
	on(
		event: "all",
		listener: (eventName: EventName, filePath: string) => void | Promise<void>
	): AssetsWatcher;
	on(event: "error", listener: (error: Error) => void): AssetsWatcher;
};

/**
 * Watch an assets directory for changes that should trigger a local-dev reload.
 *
 * On macOS and Windows this uses a single recursive `fs.watch`, which is one
 * FSEvents / ReadDirectoryChangesW handle for the whole tree. Chokidar 4
 * otherwise opens one `fs.watch` (kqueue) per file on those platforms, and
 * past macOS `OPEN_MAX` (10240) child-process spawns fail with `EBADF`
 * without ever raising `EMFILE`.
 *
 * Linux keeps chokidar: its inotify backend watches directories rather than
 * each file, so a large assets tree does not exhaust descriptors the same way.
 *
 * @param assetsDir Absolute path of the assets directory to watch.
 * @param ignoredDirs Directories whose writes must not reload (for example
 * `.wrangler` and the persist directory). Callers must already omit the
 * assets directory itself when it would otherwise appear in this list.
 * @returns A watcher with chokidar-like `on("all" | "error")` and `close()`.
 */
export function watchAssetsDirectory(
	assetsDir: string,
	ignoredDirs: string[]
): AssetsWatcher {
	if (process.platform === "darwin" || process.platform === "win32") {
		return watchAssetsDirectoryRecursive(assetsDir, ignoredDirs);
	}
	return watchAssetsDirectoryChokidar(assetsDir, ignoredDirs);
}

function watchAssetsDirectoryChokidar(
	assetsDir: string,
	ignoredDirs: string[]
): AssetsWatcher {
	return watch(assetsDir, {
		persistent: true,
		ignoreInitial: true,
		// Chokidar does not walk an ignored directory, so writes under
		// `.wrangler` and `dev.persist` do not reload.
		ignored: ignoredDirs,
	});
}

function watchAssetsDirectoryRecursive(
	assetsDir: string,
	ignoredDirs: string[]
): AssetsWatcher {
	const nativeWatcher = fs.watch(assetsDir, {
		persistent: true,
		recursive: true,
		encoding: "utf8",
	});

	const allListeners: Array<
		(eventName: EventName, filePath: string) => void | Promise<void>
	> = [];
	const errorListeners: Array<(error: Error) => void> = [];

	nativeWatcher.on("change", (_eventType, filename) => {
		const filePath =
			filename == null || filename === ""
				? assetsDir
				: path.resolve(assetsDir, filename.toString());
		if (ignoredDirs.some((dir) => isPathInsideDir(filePath, dir))) {
			return;
		}
		for (const listener of allListeners) {
			void listener("change", filePath);
		}
	});

	nativeWatcher.on("error", (error: Error) => {
		for (const listener of errorListeners) {
			listener(error);
		}
	});

	const watcher: AssetsWatcher = {
		close() {
			// Real `fs.watch` closes synchronously (`void`). Tests delay close
			// with a Promise, which `#ensureWatchingAssets` / `teardown` await.
			return nativeWatcher.close() as unknown as void | Promise<void>;
		},
		on(event, listener) {
			if (event === "all") {
				allListeners.push(
					listener as (
						eventName: EventName,
						filePath: string
					) => void | Promise<void>
				);
			} else {
				errorListeners.push(listener as (error: Error) => void);
			}
			return watcher;
		},
	};
	return watcher;
}

/**
 * Whether `target` is `dir` or a path inside it.
 *
 * A prefix check that requires a path separator after `dir` so that
 * `.wrangler-backup` is not treated as inside `.wrangler`.
 */
function isPathInsideDir(target: string, dir: string): boolean {
	const resolvedDir = path.resolve(dir);
	const resolvedTarget = path.resolve(target);
	const prefix = resolvedDir.endsWith(path.sep)
		? resolvedDir
		: resolvedDir + path.sep;
	return resolvedTarget === resolvedDir || resolvedTarget.startsWith(prefix);
}
