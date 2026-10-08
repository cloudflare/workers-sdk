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
const containerCleanupKey = Symbol("vite-plugin-cloudflare:container-cleanup");
type InlineConfigWithCleanup = InlineConfig & {
	[containerCleanupKey]?: ContainerCleanup;
};
type CloseWithCleanup = ViteDevServer["close"] & {
	[containerCleanupKey]?: ContainerCleanup;
};

/**
 * Retains Container cleanup across config reloads for one server session.
 */
export function getDevContainerCleanup(
	server: ViteDevServer
): ContainerCleanup {
	let cleanup = (server.config.inlineConfig as InlineConfigWithCleanup)[
		containerCleanupKey
	];
	if (!cleanup) {
		cleanup = createContainerCleanup();
		// Vite reuses its inline config on restart. Clone it so independently
		// created servers do not share cleanup state.
		const inlineConfig: InlineConfigWithCleanup = {
			...server.config.inlineConfig,
			[containerCleanupKey]: cleanup,
		};
		server.config = { ...server.config, inlineConfig };
	}
	attachContainerCleanup(server, cleanup);
	return cleanup;
}

function attachContainerCleanup(
	server: ViteDevServer,
	cleanup: ContainerCleanup
) {
	// Vite replaces close on restart, so a marker on the function tracks the
	// current server implementation without leaking to the replacement.
	if ((server.close as CloseWithCleanup)[containerCleanupKey] === cleanup) {
		return;
	}
	const restartServer = server.restart.bind(server);
	server.restart = (...args) =>
		cleanup.restart(async () => {
			await restartServer(...args);
			// Vite replaces the server's close method on restart. If the reloaded
			// config removed Cloudflare, no plugin hook reattaches cleanup.
			if (
				!server.config.plugins.some(
					(plugin) => plugin.name === "vite-plugin-cloudflare:dev"
				)
			) {
				attachContainerCleanup(server, cleanup);
			}
		});

	const closeServer = server.close.bind(server);
	const closeWithCleanup: CloseWithCleanup = async () => {
		try {
			await closeServer();
		} finally {
			if (!cleanup.isRestarting) {
				cleanup.cleanup();
			}
		}
	};
	closeWithCleanup[containerCleanupKey] = cleanup;
	server.close = closeWithCleanup;
}
