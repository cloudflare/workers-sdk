import assert from "node:assert";
import getPort, { portNumbers } from "get-port";
import colors from "picocolors";
import type { DevLogger } from "./logger";
import type { IncomingMessage, NextFunction } from "./request-handler";
import type { ServerResponse } from "node:http";

export const DEBUG_PATH = "/__debug";
const DEFAULT_INSPECTOR_PORT = 9229;

/**
 * Gets the inspector port option that should be passed to Miniflare based on the user's plugin config
 *
 * @param options.inspectorPort The user's `inspectorPort` option
 * @param options.getPreviousPort Gets the port used before a dev server restart, if any
 * @param options.logger Logs a warning when the default port is unavailable
 * @returns The port, or `false` if the inspector is disabled
 */
export async function resolveInspectorPort(options: {
	inspectorPort: number | false | undefined;
	getPreviousPort: () => Promise<number | null>;
	logger: Pick<DevLogger, "warn">;
}): Promise<number | false> {
	const { inspectorPort } = options;

	if (inspectorPort === undefined || inspectorPort === 0) {
		const resolvedInspectorPort = await options.getPreviousPort();

		if (resolvedInspectorPort !== null) {
			// the user is not specifying an inspector port to use and we're already
			// using one (this is a server restart) so let's just reuse that
			return resolvedInspectorPort;
		}
	}

	const inputInspectorPort =
		inspectorPort ?? (await getFirstAvailablePort(DEFAULT_INSPECTOR_PORT));

	if (
		inspectorPort === undefined &&
		inputInspectorPort !== DEFAULT_INSPECTOR_PORT
	) {
		options.logger.warn(
			colors.dim(
				`Default inspector port ${DEFAULT_INSPECTOR_PORT} not available, using ${inputInspectorPort} instead\n`
			)
		);
	}

	return inputInspectorPort;
}

function getFirstAvailablePort(start: number) {
	return getPort({ port: portNumbers(start, 65535) });
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

/**
 * Creates middleware for the {@link DEBUG_PATH} page, which opens DevTools for each Worker.
 *
 * @param workerNames The names of the Workers to debug
 * @param getInspectorPort Gets the inspector port that Miniflare is using, or `null` if there isn't one
 * @returns The middleware
 */
export function createDebugMiddleware(
	workerNames: string[],
	getInspectorPort: () => Promise<number | null>
) {
	return async (
		_req: IncomingMessage,
		res: ServerResponse,
		next: NextFunction
	): Promise<void> => {
		const resolvedInspectorPort = await getInspectorPort();

		if (resolvedInspectorPort) {
			const html = getDebugPathHtml(workerNames, resolvedInspectorPort);
			res.setHeader("Content-Type", "text/html");
			res.end(html);
		} else {
			next();
		}
	};
}
