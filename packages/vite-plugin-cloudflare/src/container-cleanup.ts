import { cleanupContainers } from "@cloudflare/containers-shared";
import type { InlineConfig, ViteDevServer } from "vite";

/** Owns Container cleanup for one server session, including failed attempts. */
export function createContainerCleanup() {
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

	return {
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
				await action();
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
}

type ContainerCleanup = ReturnType<typeof createContainerCleanup>;

// Vite reuses the inline config when it creates a new server during a restart.
// Keep the cleanup state with that config without changing its plugin list.
const cleanupByInlineConfig = new WeakMap<InlineConfig, ContainerCleanup>();

/**
 * Retains Container cleanup across config reloads for one server session.
 */
export function getDevContainerCleanup(
	server: ViteDevServer
): ContainerCleanup {
	let cleanup = cleanupByInlineConfig.get(server.config.inlineConfig);
	if (!cleanup) {
		cleanup = createContainerCleanup();
		// Clone the inline config so callers can use the same options to create
		// independent servers.
		const inlineConfig = { ...server.config.inlineConfig };
		cleanupByInlineConfig.set(inlineConfig, cleanup);
		server.config = { ...server.config, inlineConfig };
	}
	attachContainerCleanup(server, cleanup);
	return cleanup;
}

function attachContainerCleanup(
	server: ViteDevServer,
	cleanup: ContainerCleanup
) {
	const restartServer = server.restart.bind(server);
	server.restart = (...args) => cleanup.restart(() => restartServer(...args));

	const closeServer = server.close.bind(server);
	server.close = async () => {
		try {
			await closeServer();
		} finally {
			if (!cleanup.isRestarting) {
				cleanup.cleanup();
			}
		}
	};
}
