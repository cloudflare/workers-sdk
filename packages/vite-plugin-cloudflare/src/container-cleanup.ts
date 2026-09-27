import { cleanupContainers } from "@cloudflare/containers-shared";
import type { Plugin, ViteDevServer } from "vite";

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
type ContainerCleanupPlugin = Plugin<ContainerCleanup>;

/**
 * Retains Container cleanup across config reloads using Vite's inline plugins.
 * The state belongs to this server, not the re-evaluated cloudflare() factory.
 */
export function getDevContainerCleanup(
	server: ViteDevServer
): ContainerCleanup {
	const pluginName = "vite-plugin-cloudflare:container-cleanup";
	const retainedPlugin = server.config.plugins.find(
		(plugin): plugin is ContainerCleanupPlugin => plugin.name === pluginName
	);
	if (retainedPlugin?.api) {
		return retainedPlugin.api;
	}

	const cleanup = createContainerCleanup();
	const plugin: ContainerCleanupPlugin = {
		name: pluginName,
		api: cleanup,
		configureServer(nextServer) {
			attachContainerCleanup(nextServer, cleanup);
		},
	};
	// Clone the inline config so callers can use the same options to create
	// independent servers. Vite retains these plugins when reloading its config.
	server.config = {
		...server.config,
		inlineConfig: {
			...server.config.inlineConfig,
			plugins: [...(server.config.inlineConfig.plugins ?? []), plugin],
		},
	};
	// The new inline plugin participates in subsequent restarts. Attach its
	// lifecycle hooks explicitly for the server already being configured.
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
