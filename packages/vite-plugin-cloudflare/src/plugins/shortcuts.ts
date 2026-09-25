import { convertToWranglerConfig } from "@cloudflare/config";
import {
	convertConfigToBindings,
	printBindings,
} from "@cloudflare/workers-utils";
import {
	CorePaths,
	getDefaultDevRegistryPath,
	getWorkerRegistry,
} from "miniflare";
import open from "open";
import colors from "picocolors";
import { assertIsNotPreview, assertIsPreview } from "../context";
import { createPlugin, satisfiesMinimumViteVersion } from "../utils";
import { extendTunnelExpiry, isTunnelOpen, toggleTunnel } from "./tunnel";
import type { PluginContext } from "../context";
import type {
	ParsedInputContainerConfig,
	ParsedInputWorkerConfig,
	ParsedOutputContainerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type { ContainerApp } from "@cloudflare/workers-utils";
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
			addShortcuts(viteDevServer, ctx);
		},
		async configurePreviewServer(vitePreviewServer) {
			if (!isCustomShortcutsSupported) {
				return;
			}

			assertIsPreview(ctx);
			addShortcuts(vitePreviewServer, ctx);
		},
	};
});

export function addShortcuts(
	server: vite.ViteDevServer | vite.PreviewServer,
	ctx: PluginContext
) {
	if (!process.stdin.isTTY) {
		return;
	}

	const registryPath = getDefaultDevRegistryPath();
	const printBindingsShortcut = {
		key: "b",
		description: "list configured Cloudflare bindings",
		action: (viteServer) => {
			viteServer.config.logger.info("");

			const workerConfigs = ctx.allWorkerConfigs;

			for (const workerConfig of workerConfigs) {
				const wranglerConfig = convertToWranglerConfig({
					worker: workerConfig,
					containers: [],
				});
				const bindings = convertConfigToBindings(wranglerConfig, {
					usePreviewIds: true,
				});

				printBindings(bindings, {
					tailConsumers: wranglerConfig.tail_consumers,
					streamingTailConsumers: wranglerConfig.streaming_tail_consumers,
					containers: getWorkerContainersForDisplay({
						workerConfig,
						containers: ctx.resolvedPluginConfig.containers,
					}),
					warnIfNoBindings: true,
					isMultiWorker: workerConfigs.length > 1,
					name: workerConfig.name ?? "Your Worker",
					registry: getWorkerRegistry(registryPath),
					log: (message) => viteServer.config.logger.info(message),
				});
			}
		},
	} satisfies vite.CLIShortcut;

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
	} satisfies vite.CLIShortcut;

	const toggleTunnelShortcut = {
		key: "t",
		description: "start or close tunnel",
		action: () => {
			void toggleTunnel(server, ctx).catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				server.config.logger.error(colors.red(`Error: ${message}`));
			});
		},
	} satisfies vite.CLIShortcut;
	const extendTunnelExpiryShortcut = {
		key: "a",
		description: "extend tunnel by 1 hour",
		action: () => {
			extendTunnelExpiry();
		},
	} satisfies vite.CLIShortcut;

	const bindCLIShortcuts = server.bindCLIShortcuts.bind(server);
	server.bindCLIShortcuts = (options?: vite.BindCLIShortcutsOptions) => {
		if (
			server.httpServer &&
			process.stdin.isTTY &&
			!process.env.CI &&
			options?.print
		) {
			if (ctx.allWorkerConfigs.length > 0) {
				server.config.logger.info(
					colors.dim(colors.green("  ➜")) +
						colors.dim("  press ") +
						colors.bold(`${printBindingsShortcut.key} + enter`) +
						colors.dim(` to ${printBindingsShortcut.description}`)
				);
			}

			server.config.logger.info(
				colors.dim(colors.green("  ➜")) +
					colors.dim("  press ") +
					colors.bold(`${openExplorerShortcut.key} + enter`) +
					colors.dim(` to ${openExplorerShortcut.description}`)
			);

			server.config.logger.info(
				colors.dim(colors.green("  ➜")) +
					colors.dim("  press ") +
					colors.bold(`${toggleTunnelShortcut.key} + enter`) +
					colors.dim(` to ${isTunnelOpen() ? "close tunnel" : "start tunnel"}`)
			);
		}

		bindCLIShortcuts(options);
	};

	server.bindCLIShortcuts({
		customShortcuts: [
			printBindingsShortcut,
			openExplorerShortcut,
			toggleTunnelShortcut,
			extendTunnelExpiryShortcut,
		],
	});
}

/**
 * Creates the small legacy display shape consumed by `printBindings` directly
 * from input Container definitions and Worker export links.
 */
export function getWorkerContainersForDisplay(options: {
	workerConfig: ParsedInputWorkerConfig | ParsedOutputWorkerConfig;
	containers: Array<ParsedInputContainerConfig | ParsedOutputContainerConfig>;
}): ContainerApp[] {
	const containersByName = new Map(
		options.containers.map((container) => [container.name, container])
	);
	const displayContainers: ContainerApp[] = [];
	for (const [className, workerExport] of Object.entries(
		options.workerConfig.exports ?? {}
	)) {
		if (
			workerExport.type !== "durable-object" ||
			!("container" in workerExport) ||
			workerExport.container === undefined
		) {
			continue;
		}
		const container = containersByName.get(workerExport.container);
		if (container === undefined) {
			continue;
		}
		if (container.schedulingPolicy === "durable-object") {
			displayContainers.push({
				name: container.name,
				class_name: className,
				scheduling_policy: "durable_object",
			});
			continue;
		}
		const image = container.image;
		displayContainers.push({
			name: container.name,
			class_name: className,
			image:
				"dockerfile" in image
					? image.dockerfile
					: "reference" in image
						? image.reference
						: image.localReference,
			scheduling_policy: container.schedulingPolicy,
		});
	}
	return displayContainers;
}
