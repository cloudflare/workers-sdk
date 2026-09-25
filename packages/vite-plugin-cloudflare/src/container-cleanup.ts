import { AsyncLocalStorage } from "node:async_hooks";
import { cleanupContainers } from "@cloudflare/containers-shared";
import type { ViteDevServer } from "vite";

export interface ContainerCleanup {
	cleanup(): void;
	readonly isRestarting: boolean;
	restart(action: () => Promise<void>): Promise<void>;
	track(dockerPath: string, imageTags: Iterable<string>): void;
}

const restartingContainerCleanup = new AsyncLocalStorage<ContainerCleanup>();
const serverContainerCleanups = new WeakMap<ViteDevServer, ContainerCleanup>();

/** Owns Container cleanup for one server session, including failed attempts. */
export function createContainerCleanup(): ContainerCleanup {
	const pendingImages = new Map<string, Set<string>>();
	let restarting = false;

	function cleanupContainerImages() {
		for (const [dockerPath, imageTags] of pendingImages) {
			if (cleanupContainers(dockerPath, imageTags)) {
				pendingImages.delete(dockerPath);
			}
		}
		if (pendingImages.size === 0) {
			process.off("exit", cleanupContainerImages);
		}
	}

	const cleanup: ContainerCleanup = {
		cleanup: cleanupContainerImages,
		get isRestarting() {
			return restarting;
		},
		async restart(action: () => Promise<void>) {
			// Vite coalesces concurrent restart requests. Only the outer request
			// owns cleanup and the flag protecting closure of the old server.
			if (restarting) {
				return action();
			}
			cleanupContainerImages();
			restarting = true;
			try {
				await restartingContainerCleanup.run(cleanup, action);
			} finally {
				restarting = false;
			}
		},
		track(dockerPath: string, imageTags: Iterable<string>) {
			const tags = new Set([
				...(pendingImages.get(dockerPath) ?? []),
				...imageTags,
			]);
			if (tags.size === 0) {
				return;
			}
			pendingImages.set(dockerPath, tags);
			process.off("exit", cleanupContainerImages);
			process.on("exit", cleanupContainerImages);
		},
	};
	return cleanup;
}

/**
 * Retains Container cleanup across config reloads without changing Vite's inline
 * config. Replacement servers are created within the original restart's async
 * context, so they inherit its cleanup state. Independently created servers get
 * independent state even when they use the same inline config object.
 */
export function getDevContainerCleanup(
	server: ViteDevServer
): ContainerCleanup {
	let cleanup = serverContainerCleanups.get(server);
	if (!cleanup) {
		cleanup = restartingContainerCleanup.getStore() ?? createContainerCleanup();
		serverContainerCleanups.set(server, cleanup);
	}
	return cleanup;
}
