import {
	CorePaths,
	getDefaultDevRegistryPath,
	getWorkerRegistry,
} from "miniflare";
import open from "open";
import colors from "picocolors";
import * as wrangler from "wrangler";
import { assertIsNotPreview, assertIsPreview } from "../context";
import { createPlugin, satisfiesMinimumViteVersion } from "../utils";
import type { PluginContext } from "../context";
import type * as vite from "vite";

export const shortcutsPlugin = createPlugin("shortcuts", (ctx) => {
	// This requires Vite 7.2.7 which fixes custom CLI shortcuts support
	// @see https://github.com/vitejs/vite/pull/21103
	const isCustomShortcutsSupported = satisfiesMinimumViteVersion("7.2.7");

	return {
		async configureServer(viteDevServer) {
			if (!isCustomShortcutsSupported) {
				return;
			}

			assertIsNotPreview(ctx);
			addBindingsShortcut(viteDevServer, ctx);
			addExplorerShortcut(viteDevServer);
		},
		async configurePreviewServer(vitePreviewServer) {
			if (!isCustomShortcutsSupported) {
				return;
			}

			assertIsPreview(ctx);
			addBindingsShortcut(vitePreviewServer, ctx);
			addExplorerShortcut(vitePreviewServer);
		},
	};
});

export function addBindingsShortcut(
	server: vite.ViteDevServer | vite.PreviewServer,
	ctx: PluginContext
) {
	const workerConfigs = ctx.allWorkerConfigs;

	if (workerConfigs.length === 0) {
		return;
	}

	// Interactive shortcuts should only be registered in a TTY environment
	if (!process.stdin.isTTY) {
		return;
	}

	const registryPath = getDefaultDevRegistryPath();
	const printBindingsShortcut = {
		key: "b",
		description: "list configured Cloudflare bindings",
		action: (viteServer) => {
			viteServer.config.logger.info("");

			for (const workerConfig of workerConfigs) {
				const bindings =
					wrangler.unstable_convertConfigBindingsToStartWorkerBindings(
						workerConfig
					);

				wrangler.unstable_printBindings(
					bindings,
					workerConfig.tail_consumers,
					workerConfig.streaming_tail_consumers,
					workerConfig.containers,
					{
						warnIfNoBindings: true,
						isMultiWorker: workerConfigs.length > 1,
						name: workerConfig.name ?? "Your Worker",
						registry: getWorkerRegistry(registryPath),
						log: (message: string) => viteServer.config.logger.info(message),
					}
				);
			}
		},
	} satisfies vite.CLIShortcut<vite.ViteDevServer | vite.PreviewServer>;

	// Update the bindCLIShortcuts method to print our shortcut hint first
	const bindCLIShortcuts = server.bindCLIShortcuts.bind(server);
	server.bindCLIShortcuts = (
		options?: vite.BindCLIShortcutsOptions<
			vite.ViteDevServer | vite.PreviewServer
		>
	) => {
		if (
			// Vite will not print shortcuts if not in a TTY or in CI
			// @see https://github.com/vitejs/vite/blob/fa3753a0f3a6c12659d8a68eefbd055c5ab90552/packages/vite/src/node/shortcuts.ts#L28-L35
			server.httpServer &&
			process.stdin.isTTY &&
			!process.env.CI &&
			options?.print
		) {
			server.config.logger.info(
				colors.dim(colors.green("  ➜")) +
					colors.dim("  press ") +
					colors.bold(`${printBindingsShortcut.key} + enter`) +
					colors.dim(` to ${printBindingsShortcut.description}`)
			);
		}

		bindCLIShortcuts(options);
	};

	// Add the custom binding shortcut
	server.bindCLIShortcuts({
		customShortcuts: [printBindingsShortcut],
	});
}

export function addExplorerShortcut(
	server: vite.ViteDevServer | vite.PreviewServer
) {
	if (!process.stdin.isTTY) {
		return;
	}

	const openExplorerShortcut = {
		key: "e",
		description: "open local explorer",
		action: async (viteServer) => {
			const url = viteServer.resolvedUrls?.local[0];
			if (!url) {
				viteServer.config.logger.warn("No local URL available");
				return;
			}

			const explorerUrl = new URL(CorePaths.EXPLORER, url).href;
			const childProcess = await open(explorerUrl);
			childProcess.on("error", () => {
				viteServer.config.logger.warn(
					"Failed to open browser, the local explorer can be accessed at " +
						explorerUrl
				);
			});
		},
	} satisfies vite.CLIShortcut<vite.ViteDevServer | vite.PreviewServer>;

	// Wrap bindCLIShortcuts to print our shortcut hint
	const bindCLIShortcuts = server.bindCLIShortcuts.bind(server);
	server.bindCLIShortcuts = (
		options?: vite.BindCLIShortcutsOptions<
			vite.ViteDevServer | vite.PreviewServer
		>
	) => {
		if (
			server.httpServer &&
			process.stdin.isTTY &&
			!process.env.CI &&
			options?.print
		) {
			server.config.logger.info(
				colors.dim(colors.green("  ➜")) +
					colors.dim("  press ") +
					colors.bold(`${openExplorerShortcut.key} + enter`) +
					colors.dim(` to ${openExplorerShortcut.description}`)
			);
		}

		bindCLIShortcuts(options);
	};

	server.bindCLIShortcuts({
		customShortcuts: [openExplorerShortcut],
	});
}
