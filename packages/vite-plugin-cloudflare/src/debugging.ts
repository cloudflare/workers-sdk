import assert from "node:assert";
import colors from "picocolors";
import type * as vite from "vite";

export const debuggingPath = "/__debug";

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
				`  ${colors.green("➜")}  ${colors.bold("Debug")}:   ${colorDebugUrl(`${protocol}//${hostname}:${port}${debuggingPath}`)}`
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
