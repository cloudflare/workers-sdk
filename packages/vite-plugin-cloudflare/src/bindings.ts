import colors from "picocolors";
import { unstable_printBindings } from "wrangler";
import type { PluginContext } from "./plugins/utils";
import type * as vite from "vite";

export function addBindingsShortcut(
	server: vite.ViteDevServer | vite.PreviewServer,
	ctx: PluginContext
) {
	const workerConfigs = ctx.getAllWorkerConfigs();

	if (workerConfigs.length === 0) {
		return;
	}

	const bindCLIShortcuts = server.bindCLIShortcuts.bind(server);
	server.bindCLIShortcuts = (
		options?: vite.BindCLIShortcutsOptions<
			vite.ViteDevServer | vite.PreviewServer
		>
	) => {
		const printBindingsShortcut = {
			key: "b",
			description: "list configured Cloudflare bindings",
			action: (server) => {
				server.config.logger.info("");

				for (const workerConfig of workerConfigs) {
					unstable_printBindings(
						{
							...workerConfig,
							assets: workerConfig.assets?.binding
								? {
										...workerConfig.assets,
										binding: workerConfig.assets.binding,
									}
								: undefined,
							unsafe: {
								bindings: workerConfig.unsafe.bindings,
								metadata: workerConfig.unsafe.metadata,
								capnp: workerConfig.unsafe.capnp,
							},
							queues: workerConfig.queues.producers?.map((queue) => ({
								...queue,
								queue_name: queue.queue,
							})),
						},
						workerConfig.tail_consumers,
						{
							multiWorkers: workerConfigs.length > 1,
							name: workerConfig.name ?? "Your Worker",
							log: (message) => server.config.logger.info(message),
						}
					);
				}
			},
		} satisfies vite.CLIShortcut<vite.ViteDevServer | vite.PreviewServer>;

		// Print a binding shortcut hint before the help shortcut hint from bindCLIShortcuts
		if (options.print) {
			server.config.logger.info(
				colors.dim(colors.green("  ➜")) +
					colors.dim("  press ") +
					colors.bold(`${printBindingsShortcut.key} + enter`) +
					colors.dim(` to ${printBindingsShortcut.description}`)
			);
		}

		bindCLIShortcuts({
			...options,
			customShortcuts: [
				...(options?.customShortcuts ?? []),
				printBindingsShortcut,
			],
		});
	};
}
