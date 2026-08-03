import { dim } from "@cloudflare/cli-shared-helpers/colors";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listAllFlags, listFlags } from "../client";
import { statusBadge } from "../render";
import { validateLimit } from "../shared";
import type { Flag } from "../client";

export const flagshipFlagsListCommand = createCommand({
	metadata: {
		description: "List feature flags in a Flagship app",
		status: "open beta",
		owner: "Product: Flagship",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		"app-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the app",
		},
		limit: {
			type: "number",
			description: "The maximum number of flags to return (1-200)",
		},
		cursor: {
			type: "string",
			description: "The pagination cursor from a previous list call",
		},
		all: {
			type: "boolean",
			default: false,
			description: "Fetch every flag, following pagination automatically",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id"],
	async handler({ appId, limit, cursor, all, json }, { config }) {
		if (all && (limit !== undefined || cursor !== undefined)) {
			throw new UserError(
				"Cannot use --all together with --limit or --cursor.",
				{ telemetryMessage: "flagship list conflicting pagination" }
			);
		}
		validateLimit(limit, "flagship list invalid limit");
		let items: Flag[];
		let nextCursor: string | null = null;
		if (all) {
			items = await listAllFlags(config, appId);
		} else {
			const page = await listFlags(config, appId, limit, cursor);
			items = page.items;
			nextCursor = page.cursor;
		}
		if (json) {
			logger.json({ items, cursor: nextCursor });
			return;
		}
		if (items.length === 0) {
			logger.log(
				`No flags in this app yet. Create one with ${dim(`wrangler flagship flags create ${appId} <key>`)}.`
			);
			return;
		}
		logger.table(
			items.map((flag) => ({
				key: flag.key,
				status: statusBadge(flag.enabled),
				type: flag.type ?? "",
				default: flag.default_variation,
				rules: String(flag.rules.length),
			}))
		);
		if (nextCursor) {
			logger.log(dim(`\nMore flags available. Next cursor: ${nextCursor}`));
		}
	},
});
