import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listItems } from "../client";

export const aiSearchItemsListCommand = createCommand({
	metadata: {
		description: "List indexed items in an AI Search instance",
		status: "open beta",
		owner: "Product: AI",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the AI Search instance.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
		page: {
			describe:
				'Page number of the results, can configure page size using "per-page"',
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Number of items to show per page",
			type: "number",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const urlParams = new URLSearchParams();
		urlParams.set("page", args.page.toString());
		if (args.perPage !== undefined) {
			urlParams.set("per_page", args.perPage.toString());
		}

		const items = await listItems(config, args.name, urlParams);

		if (items.length === 0 && args.page === 1) {
			logger.warn("No indexed items found for this instance.");
			return;
		}

		if (items.length === 0 && args.page > 1) {
			logger.warn(
				`No items found on page ${args.page}. Please try a smaller page number.`
			);
			return;
		}

		if (args.json) {
			logger.log(JSON.stringify(items, null, 2));
			return;
		}

		logger.info(
			`Showing ${items.length} item${items.length !== 1 ? "s" : ""} from page ${args.page}:`
		);

		logger.table(
			items.map((item) => ({
				id: item.id,
				key: item.key,
				status: item.status,
				chunks: String(item.chunks_count),
				size: String(item.size),
				created: item.created_at,
			}))
		);
	},
});
