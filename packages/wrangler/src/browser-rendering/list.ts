import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { fetchBrowserRendering } from "./utils";
import type { BrowserSession } from "./types";

export const browserListCommand = createCommand({
	metadata: {
		description: "List active Browser Run sessions",
		status: "open beta",
		owner: "Product: Browser Run",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			type: "boolean",
			description: "Return output as JSON",
			default: false,
		},
	},
	async handler({ json }, { config }) {
		const accountId = await requireAuth(config);
		const sessions = await fetchBrowserRendering<BrowserSession[]>(
			config,
			`/accounts/${accountId}/browser-rendering/devtools/session`
		);

		if (json) {
			logger.json(sessions);
			return;
		}

		if (sessions.length === 0) {
			logger.log("No active Browser Run sessions found.");
			return;
		}

		logger.table(
			sessions.map((session) => ({
				"Session ID": session.sessionId,
				"Start Time": new Date(session.startTime).toLocaleString(),
				"Connection ID": session.connectionId ?? "-",
				"Connected At": session.connectionStartTime
					? new Date(session.connectionStartTime).toLocaleString()
					: "-",
			}))
		);
	},
});
