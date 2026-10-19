import {
	DEBUG_PATH,
	resolveInspectorPort,
} from "@cloudflare/workers-dev-shared";
import colors from "picocolors";
import type { PluginContext } from "./context";
import type * as vite from "vite";

/**
 * Gets the inspector port option that should be passed to Miniflare based on the user's plugin config
 */
export async function getInputInspectorPort(
	ctx: PluginContext,
	viteServer: vite.ViteDevServer | vite.PreviewServer
) {
	return resolveInspectorPort({
		inspectorPort: ctx.resolvedPluginConfig.inspectorPort,
		getPreviousPort: () => ctx.getResolvedInspectorPort(),
		logger: viteServer.config.logger,
	});
}

/**
 * Modifies the URL printing logic to also include a URL that developers can use to open DevTools to debug their Worker(s)
 */
export function addDebugToVitePrintUrls(
	server: vite.ViteDevServer | vite.PreviewServer
) {
	const originalPrintUrls = server.printUrls;
	server.printUrls = () => {
		originalPrintUrls();

		const localUrl = server.resolvedUrls?.local[0];

		if (localUrl) {
			const { protocol, hostname, port } = new URL(localUrl);

			const colorDebugUrl = (url: string) =>
				colors.dim(
					colors.yellow(
						url.replace(
							/:(\d+)\//,
							(_, portNumber) => `:${colors.bold(portNumber)}/`
						)
					)
				);
			server.config.logger.info(
				`  ${colors.green("➜")}  ${colors.bold("Debug")}:   ${colorDebugUrl(`${protocol}//${hostname}:${port}${DEBUG_PATH}`)}`
			);
		}
	};
}
