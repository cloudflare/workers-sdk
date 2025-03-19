import assert from "node:assert";
import { Response } from "miniflare";
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

		const httpServerAddress = server.httpServer?.address();
		if (httpServerAddress && typeof httpServerAddress !== "string") {
			const { port } = httpServerAddress;
			const orange = (str: string) => `\x1b[38;5;214m${str}\x1b[0m`;
			server.config.logger.info(
				`  ${orange("➜")}  Debug:   ${orange(`http://localhost:${port}${debuggingPath}`)}`
			);
		}
	};
}

/**
 * Generate an HTML page that comprises of a single script that:
 *  - redirects the page to the devtools for the debugging of the first available worker
 *  - opens tags to the devtools for all the remaining workers if any
 *
 * Note: this works based on the miniflare inspector proxy logic (where workers are available via
 * paths comprized of their names)
 *
 * @param workerNames the names of all the available workers
 * @param inspectorPort the inspector port that miniflare is using
 * @returns a miniflare html response object
 */
export function getDebuggerHtmlResponse(
	workerNames: string[],
	inspectorPort: number
) {
	// this function should always be called only when there is at least one worker to debug
	assert(workerNames.length >= 1, "no workers present to debug");

	const workerDevtoolsUrls = workerNames.map((workerName) => {
		const localHost = `localhost:${inspectorPort}/${workerName}`;
		const devtoolsFrontendUrl = `https://devtools.devprod.cloudflare.dev/js_app?theme=systemPreferred&debugger=true&ws=${localHost}`;
		return devtoolsFrontendUrl;
	});

	return new Response(
		`
            <script>
                const workerUrls = [${workerDevtoolsUrls.map((str) => JSON.stringify(str)).join(", ")}];
                const [firstUrl, ...rest] = workerUrls;
                for (const workerUrl of rest) {
                    // open new tabs for the devtools of the various workers
                    window.open(workerUrl);
                }
                // redirect the current tab to the devtools of the first worker
                window.location.replace(firstUrl);
            </script>
        `,
		{
			headers: { "Content-Type": "text/html" },
		}
	);
}
