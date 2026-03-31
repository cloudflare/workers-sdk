import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import { requireAuth } from "../user";
import { fetchBrowserRendering } from "./utils";
import type { BrowserAcquireResponse } from "./types";

const MIN_KEEP_ALIVE_SECONDS = 60;
const MAX_KEEP_ALIVE_SECONDS = 600;

export const browserCreateCommand = createCommand({
	metadata: {
		description: "Create a new browser rendering session and open DevTools",
		status: "open beta",
		owner: "Product: Browser Rendering",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		lab: {
			type: "boolean",
			description: "Enable lab browser session",
			default: false,
		},
		keepAlive: {
			type: "number",
			alias: "k",
			description: `Keep-alive duration in seconds (${MIN_KEEP_ALIVE_SECONDS}-${MAX_KEEP_ALIVE_SECONDS})`,
		},
		json: {
			type: "boolean",
			description: "Return session info as JSON instead of opening browser",
			default: false,
		},
	},
	async handler({ lab, keepAlive, json }, { config }) {
		// Validate keep-alive range
		if (keepAlive !== undefined) {
			if (
				keepAlive < MIN_KEEP_ALIVE_SECONDS ||
				keepAlive > MAX_KEEP_ALIVE_SECONDS
			) {
				throw new UserError(
					`--keep-alive must be between ${MIN_KEEP_ALIVE_SECONDS} and ${MAX_KEEP_ALIVE_SECONDS} seconds`
				);
			}
		}

		const accountId = await requireAuth(config);

		// Build query params
		const queryParams: Record<string, string | number | boolean> = {
			targets: true,
		};
		if (lab) {
			queryParams.lab = true;
		}
		if (keepAlive !== undefined) {
			// Convert seconds to milliseconds for the API
			queryParams.keep_alive = keepAlive * 1000;
		}

		const response = await fetchBrowserRendering<BrowserAcquireResponse>(
			config,
			`/accounts/${accountId}/browser-rendering/devtools/browser`,
			{ method: "POST", queryParams }
		);

		if (response.targets.length === 0) {
			throw new UserError(
				`Session created (${response.sessionId}) but no targets found`
			);
		}

		// Get the first page target, or fall back to the first target
		const pageTarget =
			response.targets.find((t) => t.type === "page") ?? response.targets[0];

		if (json) {
			logger.log(
				JSON.stringify(
					{
						sessionId: response.sessionId,
						target: {
							id: pageTarget.id,
							title: pageTarget.title,
							url: pageTarget.url,
							type: pageTarget.type,
							devtoolsUrl: pageTarget.devtoolsFrontendUrl,
							webSocketUrl: pageTarget.webSocketDebuggerUrl,
						},
					},
					null,
					2
				)
			);
		} else {
			logger.log(`Session created: ${response.sessionId}`);
			if (pageTarget.devtoolsFrontendUrl) {
				logger.log(`Opening DevTools...`);
				await openInBrowser(pageTarget.devtoolsFrontendUrl);
			}
		}
	},
});
