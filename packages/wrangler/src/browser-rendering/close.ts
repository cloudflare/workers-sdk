import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { fetchBrowserRendering } from "./utils";
import type { BrowserCloseResponse } from "./types";

export const browserCloseCommand = createCommand({
	metadata: {
		description: "Close a Browser Run session",
		status: "open beta",
		owner: "Product: Browser Run",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["sessionId"],
	args: {
		sessionId: {
			type: "string",
			description: "The session ID to close",
			demandOption: true,
		},
		json: {
			type: "boolean",
			description: "Return result as JSON",
			default: false,
		},
	},
	async handler({ sessionId, json }, { config }) {
		const accountId = await requireAuth(config);

		const response = await fetchBrowserRendering<BrowserCloseResponse>(
			config,
			`/accounts/${accountId}/browser-rendering/devtools/browser/${sessionId}`,
			{ method: "DELETE" }
		);

		if (json) {
			logger.json({
				sessionId,
				status: response.status,
			});
		} else {
			logger.log(`Session ${sessionId} ${response.status}.`);
		}
	},
});
