import assert from "node:assert";
import getPort, { portNumbers } from "get-port";
import colors from "picocolors";
import { DEBUG_PATH, DEFAULT_INSPECTOR_PORT } from "./constants";
import type { ResolvedPluginConfig } from "./plugin-config";
import type { Miniflare } from "miniflare";
import type * as vite from "vite";

/**
 * Gets the inspector port option that should be passed to miniflare based on the user's plugin config
 *
 * @param pluginConfig the user plugin configs
 * @param viteServer the vite (dev or preview) server
 * @returns the inspector port to require from miniflare or false if debugging is disabled
 */
export async function getInputInspectorPortOption(
	resolvedPluginConfig: ResolvedPluginConfig,
	viteServer: vite.ViteDevServer | vite.PreviewServer,
	miniflare?: Miniflare
) {
	if (
		resolvedPluginConfig.inspectorPort === undefined ||
		resolvedPluginConfig.inspectorPort === 0
	) {
		const resolvedInspectorPort = await getResolvedInspectorPort(
			resolvedPluginConfig,
			miniflare
		);

		if (resolvedInspectorPort !== null) {
			// the user is not specifying an inspector port to use and we're already
			// using one (this is a server restart) so let's just reuse that
			return resolvedInspectorPort;
		}
	}

	const inputInspectorPort =
		resolvedPluginConfig.inspectorPort ??
		(await getFirstAvailablePort(DEFAULT_INSPECTOR_PORT));

	if (
		resolvedPluginConfig.inspectorPort === undefined &&
		inputInspectorPort !== DEFAULT_INSPECTOR_PORT
	) {
		viteServer.config.logger.warn(
			colors.dim(
				`Default inspector port ${DEFAULT_INSPECTOR_PORT} not available, using ${inputInspectorPort} instead\n`
			)
		);
	}

	return inputInspectorPort;
}

/**
 * Gets the resolved port of the inspector provided by miniflare
 *
 * @param pluginConfig the user's plugin configuration
 * @returns the resolved port of null if the user opted out of debugging
 */
export async function getResolvedInspectorPort(
	resolvedPluginConfig: ResolvedPluginConfig,
	miniflare?: Miniflare
) {
	if (miniflare && resolvedPluginConfig.inspectorPort !== false) {
		const miniflareInspectorUrl = await miniflare.getInspectorURL();
		return Number.parseInt(miniflareInspectorUrl.port);
	}
	return null;
}

function getFirstAvailablePort(start: number) {
	return getPort({ port: portNumbers(start, 65535) });
}

/**
 * Modifies the url printing logic to also include a url that developers can use to open devtools to debug their Worker(s)
 *
 * @param server a vite server (dev or preview)
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
						url.replace(/:(\d+)\//, (_, port) => `:${colors.bold(port)}/`)
					)
				);
			server.config.logger.info(
				`  ${colors.green("➜")}  ${colors.bold("Debug")}:   ${colorDebugUrl(`${protocol}//${hostname}:${port}${DEBUG_PATH}`)}`
			);
		}
	};
}

/**
 * Generate an HTML text that comprises of a single script that:
 *  - redirects the page to the devtools for the debugging of the first available worker
 *  - opens tags to the devtools for all the remaining workers if any
 *
 * Note: this works based on the miniflare inspector proxy logic (where workers are available via
 * paths comprised of their names)
 *
 * @param workerNames the names of all the available workers
 * @param inspectorPort the inspector port that miniflare is using
 * @returns the generated html
 */
export function getDebugPathHtml(workerNames: string[], inspectorPort: number) {
	// this function should always be called only when there is at least one worker to debug
	assert(workerNames.length >= 1, "no workers present to debug");

	const workerDevtoolsUrls = workerNames.map((workerName) => {
		const localHost = `localhost:${inspectorPort}/${workerName}`;
		const searchParams = new URLSearchParams({
			theme: "systemPreferred",
			debugger: "true",
			ws: localHost,
			domain: workerName,
		});
		const devtoolsFrontendUrl = `https://devtools.devprod.cloudflare.dev/js_app?${searchParams}`;
		return devtoolsFrontendUrl;
	});

	return `
		<script>
			const workerUrls = ${JSON.stringify(workerDevtoolsUrls)};
			const [firstUrl, ...rest] = workerUrls;
			for (const workerUrl of rest) {
				// open new tabs for the devtools of the various workers
				window.open(workerUrl);
			}
			// redirect the current tab to the devtools of the first worker
			window.location.replace(firstUrl);
		</script>
    `;
}
