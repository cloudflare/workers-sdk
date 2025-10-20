import colors from "picocolors";
import { unstable_printBindings } from "wrangler";
import type { PluginContext } from "./plugins/utils";
import type * as vite from "vite";

/**
 * Modifies both the shortcut bindings and the URL printing logic
 * to include the new bindings shortcut
 */
export function addBindingsShortcut(
	server: vite.ViteDevServer | vite.PreviewServer,
	ctx: PluginContext
) {
	const workerConfigs = ctx.getAllWorkerConfigs();

	if (workerConfigs.length === 0) {
		return;
	}

	const printUrls = server.printUrls.bind(server);
	server.printUrls = () => {
		printUrls();

		server.config.logger.info(
			`  ${colors.green("➜")}  ${colors.gray("press")} ${colors.bold("b + enter")} ${colors.gray("to list worker bindings")}`
		);
	};

	const bindCLIShortcuts = server.bindCLIShortcuts.bind(server);
	server.bindCLIShortcuts = (
		options: vite.BindCLIShortcutsOptions<
			vite.PreviewServer | vite.ViteDevServer
		>
	) => {
		const customShortcuts = [
			...(options?.customShortcuts ?? []),
			{
				key: "b",
				description: "list worker bindings",
				action: async () => {
					server.config.logger.info("");

					for (const workerConfig of workerConfigs) {
						const message = unstable_printBindings(
							{
								...workerConfig,
								assets: undefined,
								unsafe: undefined,
								queues: undefined,
							},
							workerConfig.tail_consumers,
							{
								name:
									workerConfigs.length > 1
										? workerConfig.name ?? "worker"
										: undefined,
							}
						);

						server.config.logger.info(message);
					}
				},
			},
		];

		bindCLIShortcuts({
			...options,
			customShortcuts,
		});
	};
}
