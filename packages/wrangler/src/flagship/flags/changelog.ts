import { dim } from "@cloudflare/cli-shared-helpers/colors";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getAllFlagChangelog, getFlagChangelog } from "../client";
import { renderChangelogEntry } from "../render";
import { validateLimit } from "../shared";
import type { ChangelogEntry } from "../client";

export const flagshipFlagsChangelogCommand = createCommand({
	metadata: {
		description: "Show the changelog for a feature flag",
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
		key: {
			type: "string",
			demandOption: true,
			description: "The key of the flag",
		},
		limit: {
			type: "number",
			description: "The maximum number of entries to return (1-200)",
		},
		cursor: {
			type: "string",
			description: "The pagination cursor from a previous changelog call",
		},
		all: {
			type: "boolean",
			default: false,
			description: "Fetch every entry, following pagination automatically",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id", "key"],
	async handler(args, { config }) {
		const { appId, key } = args;
		if (args.all && (args.limit !== undefined || args.cursor !== undefined)) {
			throw new UserError(
				"Cannot use --all together with --limit or --cursor.",
				{ telemetryMessage: "flagship changelog conflicting pagination" }
			);
		}
		validateLimit(args.limit, "flagship changelog invalid limit");
		let items: ChangelogEntry[];
		let nextCursor: string | null = null;
		if (args.all) {
			items = await getAllFlagChangelog(config, appId, key);
		} else {
			const page = await getFlagChangelog(
				config,
				appId,
				key,
				args.limit,
				args.cursor
			);
			items = page.items;
			nextCursor = page.cursor;
		}
		if (args.json) {
			logger.json({ items, cursor: nextCursor });
			return;
		}
		if (items.length === 0) {
			logger.log(`No changelog entries for flag '${key}'.`);
			return;
		}
		logger.log(items.map(renderChangelogEntry).join("\n\n"));
		if (nextCursor) {
			logger.log(dim(`\nMore entries available. Next cursor: ${nextCursor}`));
		}
	},
});
