import assert from "node:assert";
import getPort, { portNumbers } from "get-port";
import colors from "picocolors";
import { DEBUG_PATH, DEFAULT_INSPECTOR_PORT } from "./constants";
import type { ResolvedPluginConfig } from "./plugin-config";
import type { Miniflare } from "miniflare";
import type * as vite from "vite";

/**
 * Gets the inspector port option that should be passed to Miniflare based on the user's plugin config
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
 * Gets the resolved inspector port provided by Miniflare
 */
export async function getResolvedInspectorPort(
	resolvedPluginConfig: ResolvedPluginConfig,
	miniflare: Miniflare | undefined
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
 * Generate HTML that comprises a single script that:
 *  - redirects the page to the DevTools for debugging the first available Worker
 *  - opens tabs to the DevTools for all the remaining workers if any
 *
 * Note: this works based on the Miniflare inspector proxy logic (where Workers are available via
 * their names)
 */
export function getDebugPathHtml(workerNames: string[], inspectorPort: number) {
	// this function should always be called only when there is at least one worker to debug
	assert(workerNames.length >= 1, "no workers present to debug");

	const workerDevtoolsUrls = workerNames.map((workerName) => {
		const localhost = `localhost:${inspectorPort}/${workerName}`;
		const searchParams = new URLSearchParams({
			theme: "systemPreferred",
			debugger: "true",
			ws: localhost,
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
